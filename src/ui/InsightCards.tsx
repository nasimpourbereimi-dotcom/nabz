import { useEffect } from 'preact/hooks';
import { getDB } from '../db/schema';
import { fa } from '../strings.fa';
import type { Candidate, InsightData } from '../analytics/insightEngine';
import type { LearnItem } from '../analytics/learning';
import { IconCheck, IconSpark } from './icons';

const I = fa.insight;

export function insightText(d: InsightData): string {
  switch (d.type) {
    case 'golden': return I.golden(d.from, d.to);
    case 'sleep': return I.sleep(d.longerPct, d.easierPct);
    case 'record': return I.record(fa.wrapped.record[d.kind]);
    case 'streakBest': return I.streakBest(d.days);
    case 'hrvUp': return I.hrvUp(d.delta);
    case 'rhrDown': return I.rhrDown(d.delta);
    case 'weekMore': return I.weekMore(d.pct);
    case 'consistency': return I.consistency(d.perWeek);
    case 'recoveryUp': return I.recoveryUp(d.delta);
  }
}

/** Insight of the day. Logs itself once per day so the engine won't repeat it for a week. */
export function InsightCard({ c, logged }: { c: Candidate; logged: boolean }) {
  useEffect(() => {
    if (!logged) getDB().insightLog.add({ insightId: c.id, shownAt: Date.now() }).catch(() => {});
  }, [c.id, logged]);
  const info = c.kind === 'info';
  return (
    <div class={`card ${info ? 'info' : 'suggest'} row fade-in`} style="margin-top:12px;align-items:flex-start;border-radius:18px;padding:14px 16px">
      <IconSpark color={info ? 'var(--info)' : 'var(--lilac)'} style="flex-shrink:0;margin-top:2px" />
      <div class="stack" style="gap:2px">
        <div style={{ fontSize: '13px', fontWeight: 700, color: info ? 'var(--info)' : '#D3C8FF' }}>{I.title}</div>
        <div style={{ fontSize: '12px', lineHeight: 1.7, color: info ? '#D3E6EF' : 'var(--lilac-text)' }}>{insightText(c.data)}</div>
      </div>
    </div>
  );
}

const L = fa.learning;

/** "Still learning you" as visible progress; hidden once everything is learned. */
export function LearningCard({ items }: { items: LearnItem[] }) {
  const open = items.filter((i) => !i.done);
  if (!open.length) return null;
  const done = items.length - open.length;
  const label = (i: LearnItem) => {
    switch (i.key) {
      case 'compare': return L.items.compare(i.have, i.need, fa.workouts.types[i.detail ?? 'other'] ?? fa.workouts.types.other);
      default: return L.items[i.key](i.have, i.need);
    }
  };
  return (
    <div class="card stack" style="margin-top:12px;gap:10px;padding:16px">
      <div style="font-size:14px;font-weight:700">{L.title}</div>
      <div class="muted small">{L.lead}</div>
      {open.map((i) => (
        <div key={i.key} class="stack" style="gap:6px">
          <div class="small" style="line-height:1.6">{label(i)}</div>
          <div class="progress" style="height:6px" role="progressbar" aria-valuenow={i.have} aria-valuemin={0} aria-valuemax={i.need}>
            <div style={{ width: `${(i.have / i.need) * 100}%`, background: 'var(--info)' }} />
          </div>
        </div>
      ))}
      {done > 0 && (
        <div class="row muted small" style="gap:6px"><IconCheck size={16} color="var(--info)" />{L.done(done)}</div>
      )}
    </div>
  );
}
