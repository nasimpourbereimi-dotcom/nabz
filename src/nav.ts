// Screen navigation on top of the History API, so the iOS edge-swipe and every "back" button behave the same,
// and lists come back at the scroll position you left them.
import { useCallback, useEffect, useState } from 'preact/hooks';

export type Tab = 'today' | 'workouts' | 'trends' | 'wrapped';
export type Onboard = 'welcome' | 'install' | 'shortcuts';
export type Route =
  | { tab: Tab }
  | { screen: 'data' }
  | { screen: 'guide' }
  | { screen: 'import'; firstRun: boolean }
  | { screen: 'workout'; id: string }
  | { screen: 'onboard'; step: Onboard };

interface Entry { route: Route; depth: number; scroll?: number }

const current = (): Entry | undefined => history.state?.nabz as Entry | undefined;
const write = (e: Entry, push: boolean) =>
  (push ? history.pushState : history.replaceState).call(history, { nabz: e }, '');

function restoreScroll(y: number | undefined) {
  if (!y) { window.scrollTo(0, 0); return; }
  // Lists render after their data loads; retry briefly until the page is tall enough.
  let tries = 0;
  const go = () => {
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 2 && tries++ < 10) setTimeout(go, 40);
  };
  requestAnimationFrame(go);
}

export function useNav(initial: () => Promise<Route>) {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    const existing = current();
    if (existing) setRoute(existing.route);
    else initial().then((r) => { write({ route: r, depth: 0 }, false); setRoute(r); });
    const onPop = () => {
      const e = current();
      const r = e?.route ?? { tab: 'today' as Tab };
      setRoute(r);
      restoreScroll(e?.scroll);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** Go deeper (a detail, settings, the guide): back returns here, at the same scroll position. */
  const push = useCallback((r: Route) => {
    const e = current();
    if (e) write({ ...e, scroll: window.scrollY }, false);
    write({ route: r, depth: (e?.depth ?? 0) + 1 }, true);
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  /** Switch in place (tabs, onboarding steps): no new history entry. */
  const replace = useCallback((r: Route) => {
    write({ route: r, depth: current()?.depth ?? 0 }, false);
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  /** Back to wherever we came from; if the app was opened on this screen, fall back. */
  const back = useCallback((fallback: Route) => {
    if ((current()?.depth ?? 0) > 0) history.back();
    else replace(fallback);
  }, [replace]);

  return { route, push, replace, back };
}
