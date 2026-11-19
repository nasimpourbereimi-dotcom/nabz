import { useEffect, useRef, useState } from 'preact/hooks';
import { getDB } from '../db/schema';
import { fa } from '../strings.fa';
import { backupFileName, BackupError, createBackup, restoreBackup, saveFile } from '../backup/backup';
import { IconBack } from '../ui/icons';

const S = fa.settings;

export function DataSettings({ onBack, onReimport }: { onBack: () => void; onReimport: () => void }) {
  const [persisted, setPersisted] = useState<boolean | undefined>();
  const [usedMb, setUsedMb] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setPersisted(await navigator.storage?.persisted?.());
    const est = await navigator.storage?.estimate?.();
    if (est?.usage !== undefined) setUsedMb(est.usage / 1e6);
  };
  useEffect(() => {
    // Ask once more; Safari grants it to home-screen apps.
    navigator.storage?.persist?.().finally(refresh);
  }, []);

  const doBackup = async () => {
    setBusy(true); setMsg(S.working);
    try {
      const blob = await createBackup(getDB());
      await saveFile(blob, backupFileName());
      setMsg(null);
    } catch (e) {
      console.error(e); setMsg(fa.import.errors.unknown);
    } finally { setBusy(false); }
  };

  const doRestore = async (file: File) => {
    if (!confirm(S.restoreConfirm)) return;
    setBusy(true); setMsg(S.working);
    try {
      const counts = await restoreBackup(getDB(), file, (n) => setMsg(S.restoring(n)));
      setMsg(S.restoreDone(Object.values(counts).reduce((a, b) => a + b, 0)));
      refresh();
    } catch (e) {
      console.error(e);
      setMsg(e instanceof BackupError ? S.backupErrors[e.code] : fa.import.errors.unknown);
    } finally { setBusy(false); }
  };

  return (
    <div class="screen fade-in">
      <header class="row">
        <button class="icon-btn" aria-label={fa.back} onClick={onBack}><IconBack size={20} /></button>
        <h1 class="h1">{S.title}</h1>
      </header>

      <div class="card stack" style="margin-top:18px;gap:6px">
        <div style="font-weight:700">{S.storage}</div>
        <div class="small" style={{ color: persisted ? 'var(--info)' : 'var(--lilac-text)' }}>
          {persisted === undefined ? '…' : persisted ? S.persisted : S.notPersisted}
        </div>
        {usedMb !== undefined && <div class="muted small">{S.used(usedMb)}</div>}
      </div>

      <div class="card stack" style="margin-top:12px">
        <button class="btn secondary" disabled={busy} onClick={doBackup}>{S.backup}</button>
        <div class="muted small" style="line-height:1.8">{S.backupLead}</div>
        <button class="btn secondary" disabled={busy} onClick={() => input.current?.click()}>{S.restore}</button>
        <input ref={input} type="file" accept=".gz,application/gzip" style="display:none"
          onChange={(e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0];
            (e.currentTarget as HTMLInputElement).value = '';
            if (f) doRestore(f);
          }} />
      </div>

      <div class="card stack" style="margin-top:12px">
        <button class="btn secondary" disabled={busy} onClick={onReimport}>{S.reimport}</button>
        <div class="muted small" style="line-height:1.8">{S.reimportLead}</div>
      </div>

      {msg && <div class="card info small fade-in" style="margin-top:12px" aria-live="polite">{msg}</div>}

      <div class="muted small" style="margin-top:20px;text-align:center">{S.version(__APP_VERSION__)}</div>
    </div>
  );
}
