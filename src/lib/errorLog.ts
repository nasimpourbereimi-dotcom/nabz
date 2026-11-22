// A small local error log. Nothing leaves the phone (no telemetry, CLAUDE.md §2): the owner can copy the
// report from Settings and paste it into a chat while we debug on the real iPhone, where devtools aren't handy.

export interface LoggedError { at: number; where: string; message: string; stack?: string }

const KEY = 'nabz-errors';
const MAX = 30;

export function readErrors(): LoggedError[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LoggedError[]) : [];
  } catch {
    return [];
  }
}

export function logError(where: string, e: unknown): void {
  console.error(`[${where}]`, e);
  try {
    const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e));
    const list = readErrors();
    list.push({ at: Date.now(), where, message: err.message.slice(0, 500), stack: err.stack?.slice(0, 1500) });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    listeners.forEach((l) => l());
  } catch {
    /* storage unavailable: console only */
  }
}

export function clearErrors(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
export function onErrorsChanged(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Plain-text report to paste into a chat: version, device, and the last errors. */
export function errorReport(version: string): string {
  const lines = [`Nabz ${version}`, navigator.userAgent, `standalone: ${matchMedia('(display-mode: standalone)').matches}`, ''];
  for (const e of readErrors()) {
    lines.push(`${new Date(e.at).toISOString()} [${e.where}] ${e.message}`);
    if (e.stack) lines.push(e.stack.split('\n').slice(0, 4).join('\n'));
  }
  return lines.join('\n');
}

export function installGlobalHandlers(): void {
  window.addEventListener('error', (ev) => logError('window', ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => logError('promise', ev.reason));
}
