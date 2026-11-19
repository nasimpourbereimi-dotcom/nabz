import { useState } from 'preact/hooks';
import { getDB } from '../db/schema';
import { loadWorkoutDetail } from '../db/queries';
import { fa } from '../strings.fa';
import { faDigits, faNumber } from '../lib/digits';
import { faDayLabel, faTime } from '../lib/jalali';
import { useLive } from '../ui/useLive';
import { IconBack } from '../ui/icons';
import { HrRhythmChart, ZoneBar } from '../ui/charts';

const S = fa.workouts;

export function WorkoutDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const m = useLive(() => loadWorkoutDetail(getDB(), id), [id]);
  const w = m?.workout;

  const insights: { kind: 'info' | 'suggest'; text: string }[] = [];
  // Wins first (CLAUDE.md §7).
  for (const r of m?.records ?? []) insights.push({ kind: 'info', text: S.newRecord(fa.wrapped.record[r]) });
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

          {w.typeSource === 'guessed' && <TypeConfirm id={w.id} type={w.type} inferred={w.source === 'inferred'} />}
          <RpeInput id={w.id} rpe={w.rpe} />

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

const CHOICES = ['strength', 'hiit', 'walk', 'run', 'core', 'mobility', 'cycle'];

/** One-tap type confirmation for guessed workouts (CLAUDE.md §4d). Confirmed types teach the guesser. */
function TypeConfirm({ id, type, inferred }: { id: string; type: string; inferred: boolean }) {
  const [picking, setPicking] = useState(false);
  const set = (t: string) => getDB().workouts.update(id, { type: t, typeSource: 'confirmed', typeConfidence: undefined });
  const C = fa.confirm;
  return (
    <div class="card suggest stack fade-in" style="margin-top:12px;gap:10px;border-radius:18px;padding:14px 16px">
      {inferred && <div class="small" style="line-height:1.7">{C.inferred}</div>}
      <div style="font-weight:700;color:#D3C8FF">{picking ? C.pick : C.question(S.types[type] ?? S.types.other)}</div>
      {picking ? (
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          {CHOICES.map((t) => <button key={t} class="choice" style="padding:0 12px;font-weight:400" onClick={() => set(t)}>{S.types[t]}</button>)}
        </div>
      ) : (
        <div class="row" style="gap:8px">
          <button class="btn" style="min-height:44px;flex:1" onClick={() => set(type)}>{C.yes}</button>
          <button class="btn secondary" style="min-height:44px;flex:2" onClick={() => setPicking(true)}>{C.no}</button>
        </div>
      )}
    </div>
  );
}

/** Session RPE in one tap (docs/product.md): the owner's investment that also sharpens load estimates later. */
function RpeInput({ id, rpe }: { id: string; rpe?: number }) {
  const [editing, setEditing] = useState(false);
  const R = fa.rpe;
  if (rpe !== undefined && !editing) {
    return (
      <div class="row muted small" style="margin-top:12px;justify-content:space-between;padding:0 4px">
        <span>{R.saved(rpe)}</span>
        <button class="btn ghost" style="width:auto;min-height:44px" onClick={() => setEditing(true)}>{R.change}</button>
      </div>
    );
  }
  return (
    <div class="card stack" style="margin-top:12px;gap:10px;padding:14px 16px">
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <div style="font-size:14px;font-weight:700">{R.question}</div>
        <div class="muted" style="font-size:11px">{R.scale}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} class="choice" aria-pressed={rpe === n} onClick={async () => { await getDB().workouts.update(id, { rpe: n }); setEditing(false); }}>
            {faDigits(n)}
          </button>
        ))}
      </div>
    </div>
  );
}
