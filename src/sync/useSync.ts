import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getDB } from '../db/schema';
import { applyPayload, type SyncSummary } from './apply';
import { parsePayload, PayloadError } from './payload';
import { logError } from '../lib/errorLog';

export const SHORTCUT_NAME = 'نبض-سینک';
/** Beyond this, a clipboard payload gets too big; suggest a fresh export.zip instead. */
export const MAX_SYNC_DAYS = 21;
const DAY = 86_400_000;

export type SyncState =
  | { status: 'idle' }
  | { status: 'tooOld'; days: number }
  | { status: 'waiting' } // Shortcut launched; waiting for the owner to come back and paste
  | { status: 'applying' }
  | { status: 'done'; summary: SyncSummary }
  | { status: 'error'; code: string };

export async function lastSyncTime(): Promise<number> {
  const db = getDB();
  const s = (await db.settings.get('lastSync'))?.value as number | undefined;
  if (s) return s;
  const exp = await db.syncLog.where('kind').equals('export').last();
  return exp?.exportDate ?? exp?.at ?? Date.now() - 14 * DAY;
}

export function shortcutUrl(since: number): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(new Date(since).toISOString())}`;
}

export function useSync() {
  const [state, setState] = useState<SyncState>({ status: 'idle' });
  const waiting = useRef(false);

  // When the owner returns from Shortcuts, the paste card is already on screen (clipboard reads need a tap).
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && waiting.current) setState({ status: 'waiting' }); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const launch = useCallback(async (force = false) => {
    const since = await lastSyncTime();
    const days = Math.floor((Date.now() - since) / DAY);
    if (!force && days > MAX_SYNC_DAYS) { setState({ status: 'tooOld', days }); return; }
    waiting.current = true;
    setState({ status: 'waiting' });
    window.location.href = shortcutUrl(since);
  }, []);

  const applyText = useCallback(async (text: string) => {
    setState({ status: 'applying' });
    try {
      const payload = parsePayload(text);
      const summary = await applyPayload(getDB(), payload);
      waiting.current = false;
      setState({ status: 'done', summary });
    } catch (e) {
      logError('sync', e);
      setState({ status: 'error', code: e instanceof PayloadError ? e.code : 'apply' });
    }
  }, []);

  const paste = useCallback(async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setState({ status: 'error', code: 'clipboard' });
      return;
    }
    await applyText(text);
  }, [applyText]);

  const reset = useCallback(() => { waiting.current = false; setState({ status: 'idle' }); }, []);

  return { state, launch, paste, applyText, reset };
}
