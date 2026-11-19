/// <reference lib="webworker" />
import { getDB } from '../db/schema';
import { importHealthExport } from './healthImport';
import { ImportError, openHealthZip } from './zipSource';
import type { FromWorker, ToWorker } from './protocol';

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  if (ev.data.type !== 'start') return;
  try {
    const zip = await openHealthZip(ev.data.file);
    try {
      const summary = await importHealthExport(getDB(), zip.source, post);
      post({ type: 'done', summary });
    } finally {
      await zip.close();
    }
  } catch (e) {
    const code = e instanceof ImportError ? e.code : (e as { name?: string })?.name === 'QuotaExceededError' ? 'quota' : 'unknown';
    post({ type: 'error', code, message: String(e) });
  }
};
