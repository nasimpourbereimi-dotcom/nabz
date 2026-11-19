// Inline stroke icons (no emoji, no icon font) — CLAUDE.md §8.
type P = { size?: number; color?: string; style?: string };
const base = (size = 22, color = 'currentColor') => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
  'stroke-width': 2, 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const, 'aria-hidden': true,
});

export const IconToday = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>
);
export const IconWorkouts = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><path d="M3 12h3l2-5 4 10 2-5h7" /></svg>
);
export const IconTrends = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M7 15l4-4 3 3 5-6" /></svg>
);
export const IconWrapped = ({ size, color, ...r }: P) => (
  <svg {...base(size, color)} {...r}><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
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
