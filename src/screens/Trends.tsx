import { useMemo, useState } from 'preact/hooks';
import { getDB } from '../db/schema';
import { loadTrends, type TrendsModel } from '../db/queries';
import { fa, faDuration } from '../strings.fa';
import { faDigits, faNumber } from '../lib/digits';
import { faDate } from '../lib/jalali';
import { useLive } from '../ui/useLive';
import { TimeChart, type ChartSeries } from '../ui/TimeChart';
import { dayIndex } from '../analytics/dates';
import type { RangeKey } from '../analytics/trends';
import type { RecordKind } from '../analytics/records';
import { RECORD_VALUE } from '../analytics/records';

const T = fa.trends;
const RANGES: RangeKey[] = ['3m', '6m', '1y', 'all'];
const DAY_SEC = 86_400;
/** day key → unix seconds at Tehran noon (uPlot x axis) */
const xOf = (key: string) => dayIndex(key) * DAY_SEC + 12 * 3600 - 3.5 * 3600;

export function TrendsScreen({ onOpenWorkout }: { onOpenWorkout: (id: string) => void }) {
  const [range, setRange] = useState<RangeKey>('3m');
  const m = useLive(() => loadTrends(getDB(), range), [range]);

  return (
    <div class="screen fade-in">
      <h1 class="h1">{T.title}</h1>
      <div class="segmented" role="tablist" style="margin-top:14px">
        {RANGES.map((r) => (
          <button key={r} role="tab" aria-selected={r === range} onClick={() => setRange(r)}>{T.ranges[r]}</button>
        ))}
      </div>
      {m && !m.hasData && <div class="card suggest" style="margin-top:18px;font-size:14px;line-height:1.8">{T.empty}</div>}
      {m?.hasData && <Charts m={m} onOpenWorkout={onOpenWorkout} />}
    </div>
  );
}

function Charts({ m, onOpenWorkout }: { m: TrendsModel; onOpenWorkout: (id: string) => void }) {
  const c = useMemo(() => {
    const loadX = m.load.map((p) => xOf(p.date));
    const load: ChartSeries[] = [
      { label: fa.today.fitness, values: m.load.map((p) => p.ctl), color: '#4CC3FF', width: 2.5 },
      { label: fa.today.recent, values: m.load.map((p) => p.atl), color: '#FF7A1A', width: 2.5 },
      { label: fa.today.form, values: m.load.map((p) => p.tsb), color: '#B9A6FF', dash: [4, 4] },
    ];
    const dayX = m.rhr.series.map((p) => xOf(p.date));
    const metric = (s: TrendsModel['rhr'], color: string, fmt?: (v: number) => string): ChartSeries[] => [
      { label: T.daily, values: s.series.map((p) => p.v), color: '#3A3F45', width: 1.5, fmt },
      { label: T.avg7, values: s.avg7, color, width: 2.5, fmt },
    ];
    const hours = (v: number) => faDuration(v * 60);
    return {
      loadX, load, dayX,
      rhr: metric(m.rhr, '#4CC3FF'),
      hrv: metric(m.hrv, '#B9A6FF'),
      sleep: [
        { label: T.daily, values: m.sleep.series.map((p) => (p.v === undefined ? undefined : p.v / 60)), color: '#3A3F45', width: 1.5, fmt: hours },
        { label: T.avg7, values: m.sleep.avg7.map((v) => (v === undefined ? undefined : v / 60)), color: '#C6F432', width: 2.5, fmt: hours },
      ] as ChartSeries[],
      volX: m.weeklyMinutes.map((w) => xOf(w.week) + 3 * DAY_SEC),
      vol: [{ label: T.volumeUnit, values: m.weeklyMinutes.map((w) => Math.round(w.v)), color: '#FF7A1A', bars: true }] as ChartSeries[],
      recX: m.recovery.map((r) => Math.round(r.t / 1000)),
      rec: [{ label: T.recovery, values: m.recovery.map((r) => r.v), color: '#4CC3FF', width: 2 }] as ChartSeries[],
      vo2: m.vo2 ? ([{ label: T.vo2, values: m.vo2.series.map((p) => p.v), color: '#C6F432', width: 2.5, fmt: (v: number) => faNumber(v, 1) }] as ChartSeries[]) : undefined,
    };
  }, [m]);

  const avgWeek = m.weeklyMinutes.length ? m.weeklyMinutes.reduce((a, w) => a + w.v, 0) / m.weeklyMinutes.length : 0;
  const rhrCap = m.rhr.change ? (m.rhr.change.delta <= -1 ? T.rhrDown(m.rhr.change.delta) : Math.abs(m.rhr.change.delta) < 1 ? T.steady : undefined) : undefined;
  const hrvCap = m.hrv.change ? (m.hrv.change.delta >= 2 ? T.hrvUp(m.hrv.change.delta) : Math.abs(m.hrv.change.delta) < 2 ? T.steady : undefined) : undefined;

  return (
    <>
      {m.load.length > 7 && (
        <ChartCard title={T.load}>
          <TimeChart x={c.loadX} series={c.load} aria={T.loadAria} />
          <Legend items={c.load} />
        </ChartCard>
      )}
      <ChartCard title={T.volume} caption={m.sessions ? T.volumeCaption(avgWeek, m.sessions) : undefined}>
        <TimeChart x={c.volX} series={c.vol} height={130} aria={T.volume} />
      </ChartCard>
      <ChartCard title={T.rhr} caption={rhrCap}>
        {m.rhr.series.some((p) => p.v !== undefined) ? <><TimeChart x={c.dayX} series={c.rhr} aria={T.rhr} /><Legend items={c.rhr} /></> : <Few />}
      </ChartCard>
      <ChartCard title={T.hrv} caption={hrvCap}>
        {m.hrv.series.some((p) => p.v !== undefined) ? <><TimeChart x={c.dayX} series={c.hrv} aria={T.hrv} /><Legend items={c.hrv} /></> : <Few />}
      </ChartCard>
      <ChartCard title={T.sleep}>
        {m.sleep.series.some((p) => p.v !== undefined) ? <><TimeChart x={c.dayX} series={c.sleep} aria={T.sleep} /><Legend items={c.sleep} /></> : <Few />}
      </ChartCard>
      {m.recovery.length >= 5 && (
        <ChartCard title={T.recovery} caption={T.recoveryCaption}>
          <TimeChart x={c.recX} series={c.rec} height={130} aria={T.recovery} />
        </ChartCard>
      )}
      {c.vo2 && (
        <ChartCard title={T.vo2}>
          <TimeChart x={c.dayX} series={c.vo2} height={130} aria={T.vo2} />
        </ChartCard>
      )}
      <ChartCard title={T.heat}>
        <Heatmap heat={m.heat} />
      </ChartCard>
      <Records records={m.records} onOpen={onOpenWorkout} />
    </>
  );
}

function ChartCard({ title, caption, children }: { title: string; caption?: string; children: preact.ComponentChildren }) {
  return (
    <div class="card stack" style="margin-top:12px;gap:6px;padding:16px 16px 12px">
      <div style="font-size:14px;font-weight:700">{title}</div>
      {children}
      {caption && <div class="small" style="line-height:1.7;color:#D3E6EF;margin-top:4px">{caption}</div>}
    </div>
  );
}

function Legend({ items }: { items: ChartSeries[] }) {
  return (
    <div class="row muted" style="gap:14px;font-size:11px;flex-wrap:wrap">
      {items.map((s) => (
        <span key={s.label} class="row" style="gap:5px">
          <span style={{ width: '10px', height: '3px', background: s.color, display: 'inline-block' }} />{s.label}
        </span>
      ))}
    </div>
  );
}

const Few = () => <div class="muted small">{T.few}</div>;

const HEAT = ['#1C1F23', '#5A2E10', '#9A4A14', '#D66417', '#FF7A1A'];

function Heatmap({ heat }: { heat: TrendsModel['heat'] }) {
  const cell = 11, gap = 3;
  const w = heat.weeks * (cell + gap), h = 7 * (cell + gap);
  return (
    <>
      <div dir="ltr" style="overflow-x:auto;padding-bottom:4px">
        <svg width={w} height={h} role="img" aria-label={T.heatAria} style="display:block;margin-left:auto">
          {heat.cells.filter((c) => c.inRange).map((c) => (
            <rect key={c.date} x={c.col * (cell + gap)} y={c.row * (cell + gap)} width={cell} height={cell} rx="2" fill={HEAT[c.level]}>
              <title>{`${faDate(Date.UTC(+c.date.slice(0, 4), +c.date.slice(5, 7) - 1, +c.date.slice(8, 10), 12))}: ${faDigits(c.minutes)}′`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div class="row muted" style="gap:4px;font-size:11px;justify-content:flex-end">
        <span>{T.less}</span>
        {HEAT.map((c) => <span key={c} style={{ width: '10px', height: '10px', borderRadius: '2px', background: c, display: 'inline-block' }} />)}
        <span>{T.more}</span>
      </div>
    </>
  );
}

const RECORD_FMT: Record<RecordKind, (v: number) => string> = {
  longest: (v) => fa.wrapped.minutes(v / 60),
  mostKcal: (v) => fa.wrapped.kcalValue(v),
  highestLoad: (v) => fa.wrapped.loadValue(v),
  bestRecovery: (v) => fa.wrapped.bpmDrop(v),
};

function Records({ records, onOpen }: { records: TrendsModel['records']; onOpen: (id: string) => void }) {
  const kinds = (Object.keys(RECORD_FMT) as RecordKind[]).filter((k) => records[k]);
  if (!kinds.length) return null;
  return (
    <div class="stack" style="margin-top:16px;gap:8px">
      <div class="muted" style="font-size:13px;font-weight:700;padding:0 4px">{T.records}</div>
      {kinds.map((k) => {
        const w = records[k]!;
        return (
          <button key={k} class="list-item" onClick={() => onOpen(w.id)}>
            <div class="stack" style="gap:2px">
              <div style="font-weight:700">{fa.wrapped.record[k]}</div>
              <div class="muted small">{faDate(w.start)} · {fa.workouts.types[w.type] ?? fa.workouts.types.other}</div>
            </div>
            <div style="font-weight:900;color:var(--accent)">{RECORD_FMT[k](RECORD_VALUE[k](w)!)}</div>
          </button>
        );
      })}
    </div>
  );
}
