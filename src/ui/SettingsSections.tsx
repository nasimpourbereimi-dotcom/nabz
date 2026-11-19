// Settings sections: heart-rate profile (used for zones and load) and accent colour.
import { useEffect, useState } from 'preact/hooks';
import { getDB } from '../db/schema';
import { enrichWorkouts, readProfile } from '../db/enrich';
import { fa } from '../strings.fa';
import { faDigits } from '../lib/digits';
import { toNumber } from '../sync/normalize';
import { useLive } from './useLive';
import type { HrProfile } from '../analytics/hr';

const S = fa.prefs;
export const ACCENTS = ['#FF7A1A', '#4CC3FF', '#C6F432', '#B9A6FF'];
export const TRIMP_K = [1.92, 1.67];

export function applyAccent(color: string | undefined) {
  if (color && ACCENTS.includes(color)) document.documentElement.style.setProperty('--accent', color);
}

export async function loadAccent() {
  applyAccent((await getDB().settings.get('accent'))?.value as string | undefined);
}

export function HrProfileSection() {
  const data = useLive(async () => ({
    profile: await readProfile(getDB()),
    k: ((await getDB().settings.get('trimpK'))?.value as number | undefined) ?? TRIMP_K[0],
  }));
  const [max, setMax] = useState('');
  const [rest, setRest] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (data) { setMax(faDigits(data.profile.maxHR)); setRest(faDigits(data.profile.restHR)); }
  }, [data?.profile.maxHR, data?.profile.restHR]);
  if (!data) return null;

  const recompute = async (fn: () => Promise<unknown>) => {
    setBusy(S.recomputing);
    try { await fn(); await enrichWorkouts(getDB()); setBusy(S.recomputed); }
    catch (e) { console.error(e); setBusy(fa.import.errors.unknown); }
  };
  const maxN = toNumber(max), restN = toNumber(rest);
  const valid = maxN !== undefined && restN !== undefined && maxN >= 120 && maxN <= 230 && restN >= 30 && restN <= 110 && restN < maxN;
  const changed = valid && (maxN !== data.profile.maxHR || restN !== data.profile.restHR);

  return (
    <div class="card stack" style="margin-top:12px;gap:10px">
      <div style="font-weight:700">{S.hrTitle}</div>
      <div class="muted small" style="line-height:1.8">{S.hrSource[data.profile.source]}</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
        <label class="stack small" style="gap:4px">{S.maxHR}
          <input class="input" inputMode="numeric" dir="ltr" value={max} onInput={(e) => setMax((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="stack small" style="gap:4px">{S.restHR}
          <input class="input" inputMode="numeric" dir="ltr" value={rest} onInput={(e) => setRest((e.currentTarget as HTMLInputElement).value)} />
        </label>
      </div>
      {!valid && <div class="small" style="color:var(--lilac-text)">{S.hrInvalid}</div>}
      <button class="btn secondary" disabled={!changed || !!busy && busy === S.recomputing}
        onClick={() => recompute(() => getDB().settings.put({ key: 'hrProfile', value: { maxHR: maxN!, restHR: restN!, source: 'manual' } satisfies HrProfile }))}>
        {S.save}
      </button>
      {data.profile.source === 'manual' && (
        <button class="btn ghost" onClick={() => recompute(() => getDB().settings.delete('hrProfile'))}>{S.auto}</button>
      )}

      <div style="font-weight:700;margin-top:6px">{S.kTitle}</div>
      <div class="muted small" style="line-height:1.8">{S.kLead}</div>
      <div class="row" style="gap:8px">
        {TRIMP_K.map((k) => (
          <button key={k} class="choice" style="flex:1" aria-pressed={data.k === k}
            onClick={() => data.k !== k && recompute(() => getDB().settings.put({ key: 'trimpK', value: k }))}>
            {faDigits(k.toFixed(2)).replace('.', '٫')}
          </button>
        ))}
      </div>
      {busy && <div class="small" style="color:var(--info)" aria-live="polite">{busy}</div>}
    </div>
  );
}

export function AccentSection() {
  const current = useLive(async () => ((await getDB().settings.get('accent'))?.value as string | undefined) ?? ACCENTS[0]);
  return (
    <div class="card stack" style="margin-top:12px;gap:10px">
      <div style="font-weight:700">{S.accent}</div>
      <div class="row" style="gap:12px">
        {ACCENTS.map((c) => (
          <button key={c} aria-label={c} aria-pressed={current === c}
            style={{ width: '44px', height: '44px', borderRadius: '50%', background: c, border: current === c ? '3px solid var(--text)' : '3px solid transparent' }}
            onClick={async () => { await getDB().settings.put({ key: 'accent', value: c }); applyAccent(c); }} />
        ))}
      </div>
    </div>
  );
}
