import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Discoveries, ImportCounts, ImportSummary } from './healthImport';
import type { FromWorker, ToWorker } from './protocol';

export type ImportState =
  | { status: 'idle' }
  | { status: 'running'; phase: 'scan' | 'parse' | 'save'; fraction: number; counts: ImportCounts; discoveries?: Discoveries }
  | { status: 'done'; summary: ImportSummary; discoveries?: Discoveries }
  | { status: 'error'; code: string };

/** Runs the import in a Web Worker and keeps the screen awake while it works. */
export function useImport() {
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const worker = useRef<Worker | null>(null);
  const lock = useRef<WakeLockSentinel | null>(null);

  const release = () => {
    lock.current?.release().catch(() => {});
    lock.current = null;
    worker.current?.terminate();
    worker.current = null;
  };
  useEffect(() => release, []);

  const start = useCallback(async (file: File) => {
    release();
    try { lock.current = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* optional */ }
    navigator.storage?.persist?.().catch(() => {});

    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    let discoveries: Discoveries | undefined;
    setState({ status: 'running', phase: 'scan', fraction: 0, counts: { workouts: 0, hrRecords: 0, samples: 0, days: 0, years: 0, malformed: 0 } });

    w.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      switch (m.type) {
        case 'progress':
          setState({ status: 'running', phase: m.phase, fraction: m.fraction, counts: { ...m.counts }, discoveries });
          break;
        case 'discoveries':
          discoveries = m.discoveries;
          setState((s) => (s.status === 'running' ? { ...s, discoveries } : s));
          break;
        case 'done':
          setState({ status: 'done', summary: m.summary, discoveries });
          release();
          break;
        case 'error':
          console.error(m.message);
          setState({ status: 'error', code: m.code });
          release();
          break;
      }
    };
    w.onerror = (e) => {
      console.error(e);
      setState({ status: 'error', code: 'unknown' });
      release();
    };
    w.postMessage({ type: 'start', file } satisfies ToWorker);
  }, []);

  return { state, start, reset: () => setState({ status: 'idle' }) };
}
