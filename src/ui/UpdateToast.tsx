import { useEffect, useState } from 'preact/hooks';
import { fa } from '../strings.fa';

let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
const listeners = new Set<() => void>();
let needRefresh = false;

/** Registers the service worker once. A new version is applied only when the user taps "update". */
export async function registerSW() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW: reg } = await import('virtual:pwa-register');
  updateSW = reg({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      listeners.forEach((l) => l());
    },
  });
}

export function UpdateToast() {
  const [show, setShow] = useState(needRefresh);
  useEffect(() => {
    const l = () => setShow(true);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!show) return null;
  return (
    <div class="toast card info fade-in" role="status">
      <span class="small">{fa.update.ready}</span>
      <button class="btn" style="width:auto;min-height:44px" onClick={() => updateSW?.(true)}>{fa.update.reload}</button>
    </div>
  );
}
