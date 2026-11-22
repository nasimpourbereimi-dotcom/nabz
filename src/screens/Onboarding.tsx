// First-run screens around the import: welcome, "install first" (iOS Safari), and the Shortcuts intro.
import { fa } from '../strings.fa';
import { faDigits } from '../lib/digits';
import { IconCheck, IconLock } from '../ui/icons';

const O = fa.onboarding;

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
}
export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
/** On iOS, data imported in Safari never reaches the home-screen app (separate storage). */
export const needsInstall = () => isIOS() && !isStandalone();

export function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div class="screen no-tabs fade-in">
      <div class="h1 lg" style="margin-top:56px;font-size:44px;color:var(--accent)">{fa.appName}</div>
      <h1 class="h1 lg" style="margin-top:8px">{O.welcomeTitle}</h1>
      <p class="lead">{O.welcomeLead}</p>
      <div class="stack" style="margin-top:24px">
        {O.points.map((p) => (
          <div class="step" key={p}>
            <span class="step-num" style="background:var(--info-bg)"><IconCheck size={16} color="var(--info)" /></span>
            <div>{p}</div>
          </div>
        ))}
      </div>
      <div class="row muted small" style="margin-top:14px;padding:0 4px;gap:10px">
        <IconLock size={18} color="var(--info)" style="flex-shrink:0" />
        {fa.import.privacy}
      </div>
      <div class="spacer stack" style="padding-top:24px">
        <button class="btn" onClick={onNext}>{O.start}</button>
      </div>
    </div>
  );
}

export function InstallFirst({ onContinue }: { onContinue: () => void }) {
  return (
    <div class="screen no-tabs fade-in">
      <h1 class="h1 lg" style="margin-top:56px">{O.installTitle}</h1>
      <p class="lead">{O.installLead}</p>
      <div class="stack" style="margin-top:24px">
        {O.installSteps.map((s, i) => (
          <div class="step" key={s}>
            <div class="step-num">{faDigits(i + 1)}</div>
            <div>{s}</div>
          </div>
        ))}
      </div>
      <div class="card suggest small" style="margin-top:14px;line-height:1.8">{O.installWhy}</div>
      <div class="spacer stack" style="padding-top:24px">
        <button class="btn ghost" onClick={onContinue}>{O.installAnyway}</button>
      </div>
    </div>
  );
}

export function ShortcutsIntro({ onDone, onGuide }: { onDone: () => void; onGuide: () => void }) {
  return (
    <div class="screen no-tabs fade-in">
      <div class="eyebrow" style="margin-top:40px">{O.step2}</div>
      <h1 class="h1 lg" style="margin-top:8px">{O.syncTitle}</h1>
      <p class="lead">{O.syncLead}</p>
      <div class="stack" style="margin-top:24px">
        {O.syncSteps.map((s, i) => (
          <div class="step" key={s}>
            <div class="step-num">{faDigits(i + 1)}</div>
            <div>{s}</div>
          </div>
        ))}
      </div>
      <div class="spacer stack" style="padding-top:24px">
        <button class="btn secondary" onClick={onGuide}>{fa.prefs.guide}</button>
        <button class="btn" onClick={onDone}>{O.finish}</button>
      </div>
    </div>
  );
}
