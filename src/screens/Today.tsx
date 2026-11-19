import { getDB } from '../db/schema';
import { loadToday } from '../db/queries';
import { fa, faDuration } from '../strings.fa';
import { faDigits, faNumber } from '../lib/digits';
import { faDayLabel, faDate } from '../lib/jalali';
import { useLive } from '../ui/useLive';
import { IconData, IconSpark } from '../ui/icons';
import { LoadChart, ReadinessRing, WeekBars } from '../ui/charts';
import { dayIndex } from '../analytics/dates';
import { useSync } from '../sync/useSync';
import { SyncPanel } from '../ui/SyncPanel';
import { faTime } from '../lib/jalali';
import { tehranDateKey } from '../lib/time';

const S = fa.today;

export function TodayScreen({ onOpenData, onOpenImport }: { onOpenData: () => void; onOpenImport: () => void }) {
  const m = useLive(() => loadToday(getDB()));
  const sync = useSync();

  return (
    <div class="screen fade-in">
      <header class="row" style="justify-content:space-between;align-items:flex-start">
        <div class="stack" style="gap:2px">
          <div class="muted" style="font-size:13px">{faDayLabel(Date.now())}</div>
          <h1 class="h1">{S.title}</h1>
        </div>
        <div class="row" style="gap:8px;margin-top:4px">
          <button class="chip" style="min-height:44px" onClick={() => sync.launch()} aria-label={fa.sync.button}>
            <span class="lamp" />
            {m?.lastSync ? fa.sync.lastSync(faSyncTime(m.lastSync)) : fa.sync.button}
          </button>
          <button class="icon-btn" aria-label={fa.settings.title} onClick={onOpenData}><IconData size={20} /></button>
        </div>
      </header>

      <SyncPanel
        state={sync.state}
        onPaste={sync.paste}
        onApplyText={sync.applyText}
        onForce={() => sync.launch(true)}
        onExport={() => { sync.reset(); onOpenImport(); }}
        onClose={sync.reset}
      />

      {m && !m.hasData && <div class="card suggest" style="margin-top:18px;line-height:1.8;font-size:14px">{S.noData}</div>}

      {m?.hasData && (
        <>
          {m.stale && <div class="muted small" style="margin-top:12px;line-height:1.8">{S.stale(faDate(Date.UTC(+m.asOf.slice(0, 4), +m.asOf.slice(5, 7) - 1, +m.asOf.slice(8, 10), 12)))}</div>}

          {m.readiness ? (
            <div class="card row" style="margin-top:18px;gap:18px;padding:20px">
              <ReadinessRing score={m.readiness.score} label={S.readiness} aria={S.readinessAria(m.readiness.score)} />
              <div class="stack" style="flex:1;gap:10px">
                <div style="font-size:17px;font-weight:700;line-height:1.5">{S.headline[m.readiness.level]}</div>
                <div class="stack" style="gap:6px;font-size:12px">
                  {m.readiness.hrv && <Metric label={S.hrv} value={`${faNumber(m.readiness.hrv.value)} ${S.ms}`} delta={m.readiness.hrv.delta} goodWhenUp />}
                  {m.readiness.rhr && <Metric label={S.rhr} value={faNumber(m.readiness.rhr.value)} delta={m.readiness.rhr.delta} goodWhenUp={false} />}
                  {m.readiness.sleep && <Metric label={S.sleep} value={faDuration(m.readiness.sleep.min)} delta={Math.abs(m.readiness.sleep.delta) < 15 ? 0 : m.readiness.sleep.delta} goodWhenUp hideNumber />}
                </div>
              </div>
            </div>
          ) : (
            <div class="card" style="margin-top:18px">
              <div style="font-size:17px;font-weight:700;line-height:1.5">{S.learning}</div>
              <p class="lead" style="margin-top:6px">{S.learningLead}</p>
            </div>
          )}

          {m.suggestion && (
            <div class="card suggest row" style="margin-top:12px;align-items:flex-start;border-radius:18px;padding:14px 16px">
              <IconSpark color="var(--lilac)" style="flex-shrink:0;margin-top:2px" />
              <div class="stack" style="gap:2px">
                <div style="font-size:13px;font-weight:700;color:#D3C8FF">{S.suggestionTitle}</div>
                <div style="font-size:12px;line-height:1.7">
                  {m.suggestion.kind === 'heavy' ? S.suggestion.heavy(m.suggestion.pctMore) : S.suggestion[m.suggestion.kind]}
                </div>
              </div>
            </div>
          )}

          {m.load.length > 7 && (
            <div class="card stack" style="margin-top:12px;gap:10px;padding:16px 16px 12px">
              <div class="row" style="justify-content:space-between;align-items:baseline">
                <div style="font-size:14px;font-weight:700">{S.loadTitle}</div>
                <div class="muted" style="font-size:11px">{S.loadRange}</div>
              </div>
              <LoadChart points={m.load} aria={S.loadAria} />
              <div class="row muted" style="gap:14px;font-size:11px">
                <Legend color="var(--info)" label={S.fitness} />
                <Legend color="var(--accent)" label={S.recent} />
                <Legend color="var(--lilac)" label={S.form} />
              </div>
            </div>
          )}

          <div style="margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
            <div class="card stack" style="border-radius:20px;padding:14px;gap:10px">
              <div class="muted" style="font-size:12px">{S.thisWeek}</div>
              <WeekBars minutes={m.week.minutesByDay} todayIndex={dayIndex(m.asOf) - dayIndex(m.week.start)} />
              <div style="font-size:18px;font-weight:900">{S.weekValue(m.week.sessions, m.week.totalMin)}</div>
            </div>
            <div class="card stack" style="border-radius:20px;padding:14px;gap:6px">
              <div class="muted" style="font-size:12px">{S.streakTitle}</div>
              <div style="font-size:38px;font-weight:900;line-height:1.1;color:var(--accent)">{faNumber(m.streak.current)}</div>
              <div style="font-size:12px;color:#C5C9CC">{S.streakUnit}</div>
              <div class="muted" style="font-size:11px">{S.streakBest(m.streak.best)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, delta, goodWhenUp, hideNumber }: { label: string; value: string; delta: number; goodWhenUp: boolean; hideNumber?: boolean }) {
  // No red, ever: changes are shown in calm blue (better) or muted (worse/neutral) — CLAUDE.md §7.
  const better = goodWhenUp ? delta > 0 : delta < 0;
  const sign = delta === 0 ? '≈' : delta > 0 ? '▲' : '▼';
  return (
    <div class="row" style="justify-content:space-between">
      <span class="muted">{label}</span>
      <span style="font-weight:700">
        <bdi>{value}</bdi>{' '}
        <bdi style={{ color: delta !== 0 && better ? 'var(--info)' : 'var(--muted)' }}>
          {sign}{delta !== 0 && !hideNumber ? ` ${faDigits(Math.abs(delta))}` : ''}
        </bdi>
      </span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span class="row" style="gap:5px">
      <span style={{ width: '10px', height: '3px', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

/** "امروز ۱۸:۴۰" / "دیروز ۲۳:۰۰" / "۲۵ آبان" */
function faSyncTime(ms: number): string {
  const d = tehranDateKey(ms), today = tehranDateKey(Date.now()), y = tehranDateKey(Date.now() - 86_400_000);
  if (d === today) return `امروز ${faTime(ms)}`;
  if (d === y) return `دیروز ${faTime(ms)}`;
  return faDayLabel(ms).split(' ').slice(1).join(' ');
}
