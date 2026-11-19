import { useRef } from 'preact/hooks';
import { fa } from '../strings.fa';
import { faDigits, faNumber } from '../lib/digits';
import { faYear } from '../lib/jalali';
import { useImport } from '../import/useImport';
import { IconCheck, IconLock } from '../ui/icons';
import type { Discoveries } from '../import/healthImport';

const S = fa.import;

export function ImportScreen({ onDone, onSkip, step = true }: { onDone: () => void; onSkip?: () => void; step?: boolean }) {
  const { state, start, reset } = useImport();
  const input = useRef<HTMLInputElement>(null);
  const pick = () => input.current?.click();

  const running = state.status === 'running';
  const pct = running ? Math.round(state.fraction * 100) : state.status === 'done' ? 100 : 0;
  const counts = state.status === 'running' ? state.counts : state.status === 'done' ? state.summary : undefined;
  const discoveries = state.status === 'running' || state.status === 'done' ? state.discoveries : undefined;

  if (state.status === 'done') {
    return (
      <div class="screen no-tabs fade-in">
        <div class="row" style="gap:10px">
          <span class="icon-btn" style="border-color:var(--info-border);background:var(--info-bg)"><IconCheck color="var(--info)" /></span>
          <h1 class="h1 lg">{S.doneTitle}</h1>
        </div>
        <p class="lead">{S.doneLead(state.summary.workouts, state.summary.days)}</p>
        {discoveries && <DiscoveryCard d={discoveries} />}
        <div class="spacer stack" style="padding-top:24px">
          <button class="btn" onClick={onDone}>{S.go}</button>
        </div>
      </div>
    );
  }

  return (
    <div class="screen no-tabs">
      {step && <div class="eyebrow" style="margin-top:40px">{S.step}</div>}
      <h1 class="h1 lg" style="margin-top:8px">{S.title}</h1>
      <p class="lead">{S.lead}</p>

      {!running && (
        <div class="stack" style="margin-top:24px">
          {S.steps.map(([text, bold], i) => (
            <div class="step" key={i}>
              <div class="step-num">{faDigits(i + 1)}</div>
              <div>{text}{bold && <b><bdi dir="ltr">{bold}</bdi></b>}</div>
            </div>
          ))}
        </div>
      )}

      {(running || state.status === 'error') && (
        <div class="card stack fade-in" style="margin-top:20px;gap:12px" aria-live="polite">
          <div class="row" style="justify-content:space-between;font-size:13px">
            <span style="font-weight:700">{running ? S.phase[state.phase] : S.reading}</span>
            <span style="color:var(--accent);font-weight:700">{faDigits(pct)}٪</span>
          </div>
          <div class="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${pct}%` }} />
          </div>
          <div class="stats" style="margin-top:4px">
            <Stat value={counts?.workouts} label={S.statWorkouts} />
            <Stat value={counts?.years} label={S.statYears} />
            <Stat value={counts?.hrRecords} label={S.statHr} />
          </div>
        </div>
      )}

      {running && discoveries && <DiscoveryCard d={discoveries} />}

      {state.status === 'error' && (
        <div class="card suggest fade-in" style="margin-top:14px;font-size:14px;line-height:1.8">
          {S.errors[state.code] ?? S.errors.unknown}
        </div>
      )}

      <div class="row muted small" style="margin-top:14px;padding:0 4px;gap:10px">
        <IconLock size={18} color="var(--info)" style="flex-shrink:0" />
        {running ? S.keepOpen : S.privacy}
      </div>

      <div class="spacer stack" style="padding-top:24px">
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          style="display:none"
          onChange={(e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0];
            if (f) start(f);
            (e.currentTarget as HTMLInputElement).value = '';
          }}
        />
        {!running && (
          <button class="btn" onClick={() => { if (state.status === 'error') reset(); pick(); }}>
            {state.status === 'error' ? S.retry : S.pick}
          </button>
        )}
        {!running && onSkip && <button class="btn ghost" onClick={onSkip}>{S.skip}</button>}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value?: number; label: string }) {
  return (
    <div class="stack" style="gap:2px">
      <div class="stat-value">{value === undefined ? '—' : faNumber(value)}</div>
      <div class="stat-label">{label}</div>
    </div>
  );
}

function DiscoveryCard({ d }: { d: Discoveries }) {
  if (!d.workouts) return null;
  const items = [
    S.disc.workouts(d.workouts),
    d.firstWorkout ? S.disc.since(faYear(d.firstWorkout)) : null,
    S.disc.hours(d.totalHours),
    S.disc.longest(d.longestMin),
  ].filter(Boolean) as string[];
  return (
    <div class="card info fade-in" style="margin-top:14px">
      <div class="small" style="color:var(--info);font-weight:700;margin-bottom:8px">{S.discoveriesTitle}</div>
      <div class="stack" style="gap:6px;font-size:14px">
        {items.map((t) => <div key={t}>{t}</div>)}
      </div>
    </div>
  );
}
