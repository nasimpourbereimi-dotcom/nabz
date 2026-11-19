// Interactive time-series chart (uPlot), dark theme, Persian digits, Jalali dates.
// Time runs left → right (dir="ltr" container), like the mockups. Touch: drag to inspect a day.
import { useEffect, useRef, useState } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { format } from 'date-fns-jalali';
import { faIR } from 'date-fns-jalali/locale';
import { faDigits } from '../lib/digits';

export interface ChartSeries {
  label: string;
  values: (number | null | undefined)[];
  color: string;
  width?: number;
  dash?: number[];
  bars?: boolean;
  /** formats a value for the readout line */
  fmt?: (v: number) => string;
}

const GRID = '#1F2226';
const AXIS = '#9BA1A6';
const shortDate = (sec: number) => faDigits(format(sec * 1000, 'd MMMM', { locale: faIR }));

export function TimeChart({ x, series, height = 160, aria }: { x: number[]; series: ChartSeries[]; height?: number; aria: string }) {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [readout, setReadout] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || x.length < 2) return;
    const fmtVal = (s: ChartSeries, v: number | null | undefined) => (v == null ? '—' : s.fmt ? s.fmt(v) : faDigits(Math.round(v)));
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { size: 7 } },
      scales: { x: { time: true } },
      axes: [
        {
          stroke: AXIS, grid: { show: false }, ticks: { show: false }, font: '11px Vazirmatn', size: 28,
          values: (_u, splits) => splits.map(shortDate),
        },
        {
          stroke: AXIS, grid: { stroke: GRID, width: 1 }, ticks: { show: false }, font: '11px Vazirmatn', size: 40,
          values: (_u, splits) => splits.map((v) => faDigits(Math.round(v))),
        },
      ],
      series: [
        {},
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: s.width ?? 2,
          dash: s.dash,
          spanGaps: true,
          points: { show: false },
          ...(s.bars ? { fill: s.color, paths: uPlot.paths.bars!({ size: [0.7, 24] }) } : {}),
        })),
      ],
      hooks: {
        setCursor: [
          (u) => {
            const i = u.cursor.idx;
            if (i == null) { setReadout(null); return; }
            setReadout(`${shortDate(x[i])} · ${series.map((s) => `${s.label} ${fmtVal(s, s.values[i])}`).join(' · ')}`);
          },
        ],
      },
    };
    const data = [x, ...series.map((s) => s.values.map((v) => (v == null ? null : v)))] as uPlot.AlignedData;
    plot.current = new uPlot(opts, data, el);
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => { ro.disconnect(); plot.current?.destroy(); plot.current = null; };
  }, [x, series, height]);

  return (
    <div>
      <div class="muted" style="font-size:11px;min-height:18px" aria-live="polite">{readout ?? ' '}</div>
      <div ref={box} dir="ltr" role="img" aria-label={aria} style="width:100%;touch-action:pan-y" />
    </div>
  );
}
