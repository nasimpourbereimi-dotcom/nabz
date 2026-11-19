// Inline stroke icons (no emoji, no icon font) — CLAUDE.md §8.
type P = { size?: number; color?: string; style?: string };
const base = (size = 22, color = 'currentColor') => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
  'stroke-width': 2, 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const, 'aria-hidden': true,
});

export const IconToday = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
);
export const IconWorkouts = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></svg>
);
export const IconTrends = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
);
export const IconWrapped = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 8h6M9 12h6" /></svg>
);
export const IconLock = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const IconData = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>
);
export const IconBack = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconCheck = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><path d="M5 12l5 5 9-10" /></svg>
);
export const IconSpark = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>
);
