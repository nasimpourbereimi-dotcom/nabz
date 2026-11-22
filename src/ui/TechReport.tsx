import { useEffect, useState } from 'preact/hooks';
import { fa } from '../strings.fa';
import { clearErrors, errorReport, onErrorsChanged, readErrors } from '../lib/errorLog';

/** Settings section: shown only when something went wrong on this phone. */
export function TechReportSection() {
  const [count, setCount] = useState(() => readErrors().length);
  const [copied, setCopied] = useState(false);
  useEffect(() => onErrorsChanged(() => setCount(readErrors().length)), []);
  if (!count) return null;
  const T = fa.techReport;
  return (
    <div class="card stack" style="margin-top:12px;gap:10px">
      <div style="font-weight:700">{T.title}</div>
      <div class="muted small" style="line-height:1.8">{T.lead(count)}</div>
      <button class="btn secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(errorReport(__APP_VERSION__)); setCopied(true); } catch { /* user can retry */ }
      }}>{copied ? T.copied : T.copy}</button>
      <button class="btn ghost" onClick={() => { clearErrors(); setCopied(false); }}>{T.clear}</button>
    </div>
  );
}
