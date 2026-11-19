import { useState } from 'preact/hooks';
import { fa } from '../strings.fa';
import type { SyncState } from '../sync/useSync';
import { IconCheck } from './icons';

const S = fa.sync;

/** The card under the Today header while a sync is in progress or just finished. */
export function SyncPanel(props: {
  state: SyncState;
  onPaste: () => void;
  onApplyText: (t: string) => void;
  onForce: () => void;
  onExport: () => void;
  onClose: () => void;
}) {
  const { state } = props;
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');
  if (state.status === 'idle') return null;

  if (state.status === 'tooOld') {
    return (
      <div class="card suggest stack fade-in" style="margin-top:14px;gap:10px">
        <div style="font-weight:700;color:#D3C8FF">{S.tooOldTitle}</div>
        <div class="small" style="line-height:1.8">{S.tooOld(state.days)}</div>
        <button class="btn" onClick={props.onExport}>{S.goExport}</button>
        <button class="btn ghost" onClick={props.onForce}>{S.tryAnyway}</button>
      </div>
    );
  }

  if (state.status === 'done') {
    const s = state.summary;
    return (
      <div class="card info stack fade-in" style="margin-top:14px;gap:8px" role="status">
        <div class="row" style="gap:8px;font-weight:700"><IconCheck size={18} color="var(--info)" />{S.doneTitle}</div>
        <div class="small" style="line-height:1.8">{S.done(s.workouts, s.inferred, s.days)}</div>
        {s.guessed.length > 0 && <div class="small muted" style="line-height:1.8">{S.guessedNote}</div>}
        <button class="btn secondary" style="min-height:44px" onClick={props.onClose}>{S.close}</button>
      </div>
    );
  }

  return (
    <div class="card stack fade-in" style="margin-top:14px;gap:10px" aria-live="polite">
      {state.status === 'applying' ? (
        <div class="small">{S.applying}</div>
      ) : (
        <>
          <div style="font-weight:700">{S.waitingTitle}</div>
          {state.status === 'error' ? (
            <div class="small" style="line-height:1.8;color:var(--lilac-text)">{S.errors[state.code] ?? S.errors.apply}</div>
          ) : (
            <div class="small muted" style="line-height:1.8">{S.waitingLead}</div>
          )}
          <button class="btn" onClick={props.onPaste}>{S.paste}</button>
          {manual ? (
            <>
              <textarea
                class="input"
                rows={4}
                dir="ltr"
                placeholder={S.manualPlaceholder}
                value={text}
                onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
              />
              <button class="btn secondary" disabled={!text.trim()} onClick={() => props.onApplyText(text)}>{S.manualApply}</button>
            </>
          ) : (
            <button class="btn ghost" onClick={() => setManual(true)}>{S.manual}</button>
          )}
        </>
      )}
    </div>
  );
}
