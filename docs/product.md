# Product strategy — the Nabz habit loop

Agreed with the owner on 2026-11-19 after benchmarking Whoop, Oura, Athlytic, Bevel, Gentler Streak,
TrainingPeaks/Garmin, Strava, Spotify Wrapped and Duolingo.

## Goal
A ritual the owner *loves* coming back to — not a compulsion. Same hook loop
(trigger → action → reward → investment), but never fear-based (no streak anxiety, no score anxiety).

## Biggest gap vs. native apps
Native apps get background HealthKit sync, widgets, notifications, watch complications. A PWA gets none.
**Stale data kills habits**, so the #1 UX priority is reducing sync friction, not visual polish.

## Three rituals
1. **After a workout** (strongest emotional moment)
   - End-of-workout automation copies *that workout's* payload to the clipboard + notifies "تمرینت آماده‌ست".
   - Open app → one Paste → post-workout card: session score, **one fresh finding** (variable reward), records broken.
   - One tap "چقدر سخت بود؟ ۱–۱۰" (session-RPE) — investment that also improves load accuracy.
2. **Morning** — readiness number + one sentence. Shortcuts Home Screen widget runs «نبض-سینک» in one tap.
3. **Weekly / monthly** — Friday-evening review (Iranian week) with one suggestion for next week; monthly Wrapped.

## Mechanics
- **Visible learning progress** instead of "not enough data": «۱۲ از ۲۰ تمرین تا شناختن الگوی قدرتی‌ت».
- **Insight engine with memory** (`insightLog`): pick the most interesting *new* finding (novelty × positivity × confidence);
  don't repeat the same insight within N days.
- **Many personal-record dimensions** so there is almost always a win to celebrate.
- **Forgiving streak**: rest days count as part of the path; one rest day never breaks it.
- **First wow during import**: show live discoveries while parsing (workouts found, first year, longest session).
- **Native feel**: open < 1s from precomputed `rollups`, no spinners, count-up/ring-fill animations
  (respect reduced motion) instead of haptics, safe-area insets, View Transitions.
- Tap any number → its contributors (Oura-style), for trust.
- Long-term retention driver = Phase 2 training program logging; keep the data model open for it.

## To verify on the owner's iPhone
- Can a notification tap / "Open App" in Shortcuts open the *installed* web app, or only Safari?
- Does a Shortcuts widget on the Home Screen run «نبض-سینک» smoothly?
- Web Push is possible on iOS but needs a server → out of scope for now (no-backend rule).
