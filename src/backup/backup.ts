/**
 * Backup = gzip'd NDJSON:
 *   line 1: {"nabz":"backup","v":1,"schema":<dexie version>,"exportedAt":<ms>}
 *   then:   {"t":"<table>","r":[rows…]}   (batches, keyset-paginated so memory stays flat)
 * Restore replaces all data.
 */
import type { NabzDB, TableName } from '../db/schema';
import { TABLES } from '../db/schema';

const PAGE = 2000;
export const BACKUP_VERSION = 1;

export class BackupError extends Error {
  constructor(public code: 'not-backup' | 'newer-version' | 'corrupt' | 'rolled-back' | 'rollback-failed', message?: string) {
    super(message ?? code);
  }
}

async function* lines(db: NabzDB): AsyncGenerator<string> {
  yield JSON.stringify({ nabz: 'backup', v: BACKUP_VERSION, schema: db.verno, exportedAt: Date.now() }) + '\n';
  for (const name of TABLES) {
    const table = db.table(name);
    let last: unknown = undefined;
    for (;;) {
      const coll = last === undefined ? table.orderBy(':id') : table.where(':id').above(last);
      const keys = await coll.clone().limit(PAGE).primaryKeys();
      if (!keys.length) break;
      const rows = await table.bulkGet(keys as never[]);
      yield JSON.stringify({ t: name, r: rows }) + '\n';
      last = keys[keys.length - 1];
      if (keys.length < PAGE) break;
    }
  }
}

export async function createBackup(db: NabzDB): Promise<Blob> {
  const it = lines(db);
  const text = new ReadableStream<string>({
    async pull(ctl) {
      const { value, done } = await it.next();
      if (done) ctl.close(); else ctl.enqueue(value);
    },
  });
  const gz = text.pipeThrough(new TextEncoderStream()).pipeThrough(new CompressionStream('gzip'));
  return new Response(gz).blob();
}

export function backupFileName(now = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `nabz-backup-${d}.json.gz`;
}

type Line = { nabz?: string; v?: number; t?: TableName; r?: unknown[] };

/** Streams a backup file line by line (gunzip → text → NDJSON). Any read/parse failure → BackupError. */
async function eachLine(file: Blob, onLine: (obj: Line, isHeader: boolean) => Promise<void> | void): Promise<void> {
  const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let header = false;
  const handle = async (line: string) => {
    if (!line.trim()) return;
    let obj: Line;
    try { obj = JSON.parse(line); } catch { throw new BackupError(header ? 'corrupt' : 'not-backup'); }
    await onLine(obj, !header);
    header = true;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        await handle(line);
      }
    }
    if (buf) await handle(buf);
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError(header ? 'corrupt' : 'not-backup', String(e));
  }
  if (!header) throw new BackupError('not-backup');
}

/** Reads the whole file without writing anything; throws on the first problem. */
export async function validateBackup(file: Blob): Promise<number> {
  let rows = 0;
  await eachLine(file, (obj, isHeader) => {
    if (isHeader) {
      if (obj.nabz !== 'backup') throw new BackupError('not-backup');
      if ((obj.v ?? 0) > BACKUP_VERSION) throw new BackupError('newer-version');
      return;
    }
    if (!obj.t || !TABLES.includes(obj.t) || !Array.isArray(obj.r)) throw new BackupError('corrupt');
    rows += obj.r.length;
  });
  return rows;
}

async function writeBackup(db: NabzDB, file: Blob, onProgress?: (rows: number) => void): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let total = 0;
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear();
  });
  await eachLine(file, async (obj, isHeader) => {
    if (isHeader) return;
    await db.table(obj.t!).bulkPut(obj.r!);
    counts[obj.t!] = (counts[obj.t!] ?? 0) + obj.r!.length;
    total += obj.r!.length;
    onProgress?.(total);
  });
  return counts;
}

/**
 * Replaces all data with a backup, safely:
 * 1. the whole file is validated first (nothing is touched if it is broken),
 * 2. a copy of the current data is kept in memory,
 * 3. if writing fails half-way, that copy is written back and 'rolled-back' is thrown.
 */
export async function restoreBackup(db: NabzDB, file: Blob, onProgress?: (rows: number) => void): Promise<Record<string, number>> {
  await validateBackup(file);
  const safety = await createBackup(db);
  let counts: Record<string, number>;
  try {
    counts = await writeBackup(db, file, onProgress);
  } catch (e) {
    try {
      await writeBackup(db, safety);
    } catch (e2) {
      throw new BackupError('rollback-failed', `${String(e)} / ${String(e2)}`);
    }
    throw new BackupError('rolled-back', String(e));
  }
  await db.syncLog.add({ at: Date.now(), kind: 'restore', counts });
  return counts;
}

/** iOS standalone apps can't reliably use <a download>; prefer the Share Sheet ("Save to Files"). */
export async function saveFile(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: 'application/gzip' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
