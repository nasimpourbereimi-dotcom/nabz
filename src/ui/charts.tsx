// Small hand-made SVG charts (CLAUDE.md §3). Time runs left → right even in RTL, like the mockups.
import type { LoadPoint } from '../analytics/load';
import { zoneBounds, downsample, type HrPoint } from '../analytics/hr';
import { faNumber } from '../lib/digits';

export function ReadinessRing({ score, label, aria }: { score: number; label: string; aria: string }) {
  const r = 54, c = 2 * Math.PI * r;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={aria} style="flex-shrink:0">
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--track)" stroke-width="12" />
      <circle class="ring-fill" cx="64" cy="64" r={r} fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round"
        stroke-dasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 64 64)" />
      <text x="64" y="70" text-anchor="middle" fill="var(--text)" font-family="Vazirmatn" font-size="36" font-weight="900">{faNumber(score)}</text>
      <text x="64" y="92" text-anchor="middle" fill="var(--muted)" font-family="Vazirmatn" font-size="11">{label}</text>
    </svg>
  );
}

export function LoadChart({ points, aria }: { points: LoadPoint[]; aria: string }) {
  const W = 326, H = 96, PAD = 6;
  if (points.length < 2) return null;
  const vals = points.flatMap((p) => [p.ctl, p.atl, p.tsb]);
  const lo = Math.min(...vals), hi = Math.max(...vals, lo + 1);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD);
  const line = (k: 'ctl' | 'atl' | 'tsb') => points.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} dir="ltr">
      {[24, 56, 88].map((gy) => <line key={gy} x1="0" y1={gy} x2={W} y2={gy} stroke="#1F2226" />)}
      <polyline points={line('ctl')} fill="none" stroke="var(--info)" stroke-width="2.5" stroke-linejoin="round" />
      <polyline points={line('atl')} fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" />
      <polyline points={line('tsb')} fill="none" stroke="var(--lilac)" stroke-width="2" stroke-dasharray="4 4" stroke-linejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(last.atl)} r="4" fill="var(--accent)" />
    </svg>
  );
}

export function WeekBars({ minutes, todayIndex }: { minutes: number[]; todayIndex: number }) {
  const max = Math.max(30, ...minutes);
  return (
    <div style="display:flex;align-items:flex-end;gap:6px;height:44px" aria-hidden="true">
      {minutes.map((m, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${Math.max(8, (m / max) * 100)}%`,
          background: m > 0 ? 'var(--accent)' : i > todayIndex ? '#1C1F23' : '#2A2D32',
          borderRadius: '4px',
        }} />
      ))}
    </div>
  );
}

const ZONE_FILL = ['transparent', 'var(--z2)', 'var(--lilac)', 'var(--z4)', 'var(--z5)'];

export function HrRhythmChart({ samples, start, end, maxHR, aria }: { samples: HrPoint[]; start: number; end: number; maxHR: number; aria: string }) {
  const W = 326, H = 130;
  const xs = downsample(samples.filter((s) => s.t >= start && s.t <= end), 160);
  if (xs.length < 2) return null;
  const b = zoneBounds(maxHR);
  const lo = Math.min(b[0] - 20, ...xs.map((s) => s.bpm)) - 4;
  const hi = Math.max(maxHR, ...xs.map((s) => s.bpm));
  const y = (v: number) => (1 - (v - lo) / (hi - lo)) * H;
  const x = (t: number) => ((t - start) / (end - start)) * W;
  const bands = [b[0], b[1], b[2], b[3], hi];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} dir="ltr">
      {[1, 2, 3, 4].map((z) => (
        <rect key={z} x="0" y={y(bands[z])} width={W} height={Math.max(0, y(bands[z - 1]) - y(bands[z]))} fill={ZONE_FILL[z]} opacity="0.07" />
      ))}
      <polyline points={xs.map((s) => `${x(s.t).toFixed(1)},${y(s.bpm).toFixed(1)}`).join(' ')}
        fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />
    </svg>
  );
}

export function ZoneBar({ zones }: { zones: number[] }) {
  const total = zones.reduce((a, b) => a + b, 0) || 1;
  const colors = ['var(--z1)', 'var(--z2)', 'var(--z3)', 'var(--z4)', 'var(--z5)'];
  return (
    <div style="display:flex;height:14px;border-radius:7px;overflow:hidden;gap:2px" aria-hidden="true">
      {zones.map((s, i) => s > 0 && <div key={i} style={{ width: `${(s / total) * 100}%`, background: colors[i] }} />)}
    </div>
  );
}
