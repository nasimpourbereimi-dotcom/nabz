import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { logError } from '../lib/errorLog';

/** Dexie liveQuery → Preact state; re-renders when the queried tables change (also from the worker). */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => logError('query', e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
