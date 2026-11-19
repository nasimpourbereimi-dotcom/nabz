import { getDB } from '../db/schema';
import { loadWorkoutDetail } from '../db/queries';
import { fa } from '../strings.fa';
import { faNumber } from '../lib/digits';
import { faDayLabel, faTime } from '../lib/jalali';
import { useLive } from '../ui/useLive';
import { IconBack } from '../ui/icons';
import { HrRhythmChart, ZoneBar } from '../ui/charts';

const S = fa.workouts;

export function WorkoutDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const m = useLive(() => loadWorkoutDetail(getDB(), id), [id]);
  const w = m?.workout;

  const insights: { kind: 'info' | 'suggest'; text: string }[] = [];
  if (m?.recovery) insights.push({ kind: 'info', text: S.recovery(m.recovery.drop, m.recovery.betterThanPct) });
  if (m?.efficiency) insights.push({ kind: 'info', text: S.efficiency(m.efficiency.sessions, m.efficiency.lowerBy) });
  if (m?.sleep) insights.push({ kind: 'suggest', text: S.sleepTip(m.sleep.longerPct, m.sleep.easierPct) });
  // Nothing comparative to celebrate: still say something true and useful about this session.
  if (!insights.length && w?.zones && m?.score) {
    const total = w.zones.reduce((a, b) => a + b, 0);
    const top = w.zones.indexOf(Math.max(...w.zones));
    if (total > 0) insights.push({ kind: 'info', text: S.zoneFocus(S.zones[top], Math.round((w.zones[top] / total) * 100)) });
  }

  return (
    <div class="screen no-tabs fade-in">
      <header class="row" style="gap:8px">
        <button class="icon-btn" style="border-radius:14px" aria-label={fa.back} onClick={onBack}><IconBack size={20} /></button>
        {w && (
          <div class="stack" style="gap:0">
            <div style="font-size:20px;font-weight:900">{S.types[w.type] ?? S.types.other}</div>
            <div class="muted" style="font-size:12px">{S.timeRange(faDayLabel(w.start), faTime(w.start), faTime(w.end))}</div>
          </div>
        )}
        {m?.score && (
          <div class="badge" style="margin-right:auto">{S.score[m.score.tier]} · {faNumber(m.score.score)}</div>
        )}
      </header>

      {m === undefined ? null : !w ? (
        <p class="lead">{S.notFound}</p>
      ) : (
        <>
          <div style="margin-top:16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
            <Tile v={w.durationSec / 60} l={S.statMin} />
            <Tile v={w.energyKcal} l={S.statKcal} />
            <Tile v={w.hrAvg} l={S.statAvg} />
            <Tile v={w.hrMax} l={S.statMax} accent />
          </div>

          <div class="card stack" style="margin-top:12px;gap:8px;padding:16px">
            <div style="font-size:14px;font-weight:700">{S.rhythm}</div>
            {m.samples.length >= 20 ? (
              <>
                <HrRhythmChart samples={m.samples} start={w.start} end={w.end} maxHR={m.profile.maxHR} aria={S.rhythmAria} />
                {m.sets.peaks.length >= 3 && <div class="muted" style="font-size:11px">{S.sets(m.sets.peaks.length, m.sets.regular)}</div>}
              </>
            ) : (
              <div class="muted small" style="line-height:1.8">{S.noHr}</div>
            )}
          </div>

          {w.zones && w.zones.some((z) => z > 0) && (
            <div class="card stack" style="margin-top:12px;gap:10px;padding:16px">
              <div class="row" style="justify-content:space-between;align-items:baseline">
                <div style="font-size:14px;font-weight:700">{S.zonesTitle}</div>
                <div class="muted" style="font-size:11px">{S.zonesSub}</div>
              </div>
              <ZoneBar zones={w.zones} />
              <div class="muted" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;font-size:10px;text-align:center;line-height:1.5">
                {S.zones.map((name, i) => (
                  <span key={name}>{name}<br />{S.zoneMin(w.zones![i] / 60)}</span>
                ))}
              </div>
            </div>
          )}

          <div class="stack" style="margin-top:12px;gap:8px">
            <div class="muted" style="font-size:13px;font-weight:700;padding:0 4px">{S.learnedTitle}</div>
            {insights.length ? insights.map((x) => (
              <div key={x.text} class={`card ${x.kind} row`} style="border-radius:18px;padding:12px 14px;gap:10px">
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: x.kind === 'info' ? 'var(--info)' : 'var(--lilac)' }} />
                <div style={{ fontSize: '12px', lineHeight: 1.7, color: x.kind === 'info' ? '#D3E6EF' : 'var(--lilac-text)' }}>{x.text}</div>
              </div>
            )) : <div class="muted small" style="padding:0 4px;line-height:1.8">{S.learning}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ v, l, accent }: { v?: number; l: string; accent?: boolean }) {
  return (
    <div class="stack" style="background:var(--surface);border-radius:16px;padding:12px 8px;align-items:center;gap:2px">
      <div style={{ fontSize: '18px', fontWeight: 900, color: accent ? 'var(--accent)' : undefined }}>{v === undefined ? '—' : faNumber(Math.round(v))}</div>
      <div class="muted" style="font-size:11px">{l}</div>
    </div>
  );
}
