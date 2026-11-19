# Nabz (نبض) — personal Apple Watch workout analytics PWA

A personal, offline-first web app installed on the owner's iPhone (Add to Home Screen).
It pulls workout + health data from Apple Health / Apple Watch and turns it into
**positive, useful, actionable** insights. UI language: **Persian (fa), RTL, Jalali calendar**.

The owner is a developer (SCADA / IT background), lives in Iran, uses iPhone (iOS 27) + Apple Watch.
Everything below was decided in an architecture/design review before coding. Don't silently
change these decisions — propose changes and ask.

---

## 1. Scope

**Phase 1 (this project now):** Apple Watch / Health data → analytics + dashboard.
**Later (NOT now):** the owner's own training program (currently in iPhone Notes; home workouts with
bodyweight, dumbbells, resistance bands, pull-up bar) — planned vs. performed sets, progression,
plateau detection. Keep the data model open to it, but don't build it.

## 2. Hard constraints

- **Offline-first.** Internet in Iran is unreliable/filtered. The app must fully work offline after install.
  No runtime CDN dependencies — bundle fonts (Vazirmatn) and libraries.
- **All data stays on the phone** (IndexedDB). No backend, no accounts, no analytics/telemetry.
- **iOS specifics:**
  - Installed home-screen web apps have storage **separate from Safari**. Never rely on opening a URL
    from Shortcuts to inject data — it lands in Safari's storage, not the app's.
  - Call `navigator.storage.persist()`; provide JSON backup/restore (export file, import file).
  - Clipboard read needs a user gesture (`navigator.clipboard.readText()` → iOS "Paste" prompt).
  - Web apps can open `shortcuts://run-shortcut?name=...&input=text&text=...`.
  - Use Screen Wake Lock only where needed; haptics via `navigator.vibrate` don't work on iOS — don't depend on them.
- No access to HealthKit from the web. Data comes ONLY via (a) Health export.zip, (b) Shortcuts.
- Hosting: **decided** — local dev first, then GitHub Pages (public repo is fine), later a custom `.ir`
  domain (only `.ir` opens without VPN for the owner). The origin == the storage: the final domain must be
  fixed BEFORE importing real data; changing origin later needs backup → restore. Host can change, domain shouldn't.

## 3. Stack (agreed)

- Vite + **Preact** (+ TypeScript), lightweight; no heavy UI framework.
- **Dexie** (IndexedDB).
- **uPlot** for time-series charts; small hand-made SVG for rings/bars.
- **date-fns-jalali** for Jalali dates; Persian digits in UI.
- Vazirmatn font, self-hosted.
- Service worker via **vite-plugin-pwa** (Workbox), full precache.
- Heavy parsing in a **Web Worker**.
- Vitest for unit tests (parsers + analytics are the critical code).

## 4. Data ingestion

### 4a. First run: Health `export.zip` (full history)
- User: Health app → profile → Export All Health Data → Save to Files → pick in app.
- The zip contains `apple_health_export/export.xml` (can be hundreds of MB) + workout routes etc.
- Parse **streaming** in a Web Worker: unzip streaming (e.g. fflate/@zip.js) → SAX-style XML parser
  (e.g. saxes). Never load the whole XML into memory — iOS Safari will kill the tab.
- Show progress (%, counts of workouts / years / HR samples).
- Records to extract (HK identifiers):
  - `Workout` elements (+ `WorkoutStatistics`, `WorkoutEvent`, `MetadataEntry`) — type, start, end, duration, energy, distance.
  - `HKQuantityTypeIdentifierHeartRate`
  - `HKQuantityTypeIdentifierRestingHeartRate`
  - `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`
  - `HKQuantityTypeIdentifierHeartRateRecoveryOneMinute`
  - `HKQuantityTypeIdentifierVO2Max`
  - `HKQuantityTypeIdentifierActiveEnergyBurned`
  - `HKQuantityTypeIdentifierAppleExerciseTime`
  - `HKQuantityTypeIdentifierStepCount`
  - `HKCategoryTypeIdentifierSleepAnalysis` (with stages when present)
- HR volume is huge: store raw HR only inside workout windows (+ small padding for recovery);
  outside workouts downsample (e.g. per-minute or per-5-min aggregates).
- Re-importing a newer export must be idempotent (see dedup below).

### 4b. Ongoing: Shortcuts (owner verified on iOS 27.0.1)
Verified facts:
- `Find Health Samples` has Heart Rate, HRV, Resting Heart Rate, Active Energy, Sleep (shown as "Sleep"), etc.
- `Find Health Samples` does **NOT** offer Workouts as a type.
- Actions Start/Log/End Workout exist but only WRITE — not useful.
- Automation trigger exists: **"Apple Watch Workout — when any workout is started or ended"** (no per-type selection).

Design (details in `docs/shortcuts.md`):
1. **Automation "نبض-تمرین"** (runs on any workout start/end): keeps a small state file in Files.
   No open session → this is a START → save timestamp.
   Open session → this is an END → collect HR samples + active energy between start and now,
   append a workout record to a queue file, close the session.
   Open session older than 4h → assume a missed end; start fresh.
2. **Shortcut "نبض-سینک"**, launched FROM the app's Sync button via
   `shortcuts://run-shortcut?name=...&input=text&text=<lastSyncISO>`:
   gathers queued workouts + HRV, resting HR, sleep, active energy, exercise minutes, steps, HR
   since lastSync → builds JSON → copies to clipboard → keeps only queue items newer than lastSync
   (lastSync advances only after a successful paste, so nothing is lost and the app dedups re-sends).
   User returns to the app → app reads clipboard (one "Paste" tap) → validates → imports.
3. No nightly sync needed: syncing is on demand, any time, "everything since last sync".
4. If last sync is too old (payload too large for the clipboard, roughly > a few weeks), the app suggests a fresh export.zip.

Payload is versioned JSON (`{"v":1, ...}`) — schema in `docs/shortcuts.md`. Validate strictly; reject unknown versions gracefully.

### 4c. Fallback: detect workouts from HR density
Watch logs HR every few minutes normally, every ~5s during a workout. Detect dense clusters
(+ exercise minutes / active energy confirmation) to recover workouts the automation missed
(phone not nearby, etc.). Mark them `source: "inferred"`.

### 4d. Workout type
The automation can't tell the type. Infer from HR shape: strength = regular set peaks with rest
valleys; HIIT = higher peaks, shorter rests; walk/run = smooth plateau + many steps.
First workouts: ask with one tap ("قدرتی بود؟ ✓"); learn the owner's patterns over time.
An export.zip import replaces inferred type with Health's official type.

### 4e. Dedup / merge
Workout identity = overlapping time window (not exact equality; shortcut vs export timestamps differ by seconds).
Priority: `export` > `shortcut` > `inferred`. Samples dedup by (type, start, end, value).

## 5. Data model (Dexie, first draft)

- `workouts`: id, start, end, durationSec, type, typeSource(`health|guessed|confirmed`), source(`export|shortcut|inferred`), energyKcal, distance?, hrAvg, hrMax, hrRecovery1m?, load (TRIMP), zones{z1..z5 sec}, notes
- `hrSamples`: [workoutId+t] or t, bpm (raw inside workouts)
- `dailyMetrics`: date (Jalali + ISO), restingHR, hrvSDNN, sleepMin (+stages), activeEnergy, exerciseMin, steps, vo2max?
- `syncLog`: at, kind(`export|shortcut`), counts, payloadVersion
- `settings`: maxHR / age-based HR zones (editable), units, accent color, lastSync
- `insights` (optional cache) — computed, regenerable
- `rollups` — precomputed daily/weekly aggregates so screens open instantly
- `insightLog` — which insight was shown when (novelty; avoid repeats)
- workouts also get `rpe?` (1–10 session RPE, one tap after the workout)
Leave room for a future `program` / `sessionPlan` / `setLog` (Phase 2).

## 6. Analytics (local, deterministic, unit-tested)

- **Readiness 0–100** (today): HRV vs personal 30-day baseline, resting HR vs baseline, last night's sleep. Only relative to self.
- **Fitness / recent load / form** (Banister: CTL 42d, ATL 7d, TSB = CTL − ATL) from per-workout TRIMP.
  UI labels: آمادگی / بار اخیر / فرم (never "خستگی" — see tone).
- Acute:chronic workload ratio → used only to phrase a friendly suggestion.
- HR zones per workout and per week (zones from settings; default from age or observed max HR).
- 1-minute HR recovery trend; VO2max trend when present.
- Efficiency: avg HR for similar workouts (same type, similar duration) over time.
- "Golden hour": time of day with best output per HR.
- Sleep effect: workouts after > 7h vs < 6h sleep.
- Records: longest, highest-load, most kcal; consistency streak; yearly heatmap.
- **Wrapped** (monthly story cards, screenshot-friendly).
- Optional online later: "summary for Claude" — copy a compact 4-week text summary to paste into a Claude chat. No API calls in Phase 1.

Minimum-data rule: if there's not enough data for an insight, don't judge — say "هنوز داریم یادت می‌گیریم".

## 7. Tone & product principles (owner's explicit request — important)

The app must feel **positive, useful and calming — never stressful**, especially about heart rate.
1. Every insight comes with something actionable. No bare status reports.
2. Compare only to the owner's own history, never to norms or other people.
3. Lead with wins: records, progress, consistency.
4. HR / HRV are planning tools, **not health verdicts**. Never make medical claims or suggest something is wrong with the heart.
5. No "alarm" language, warning triangles, or red. Suggestions use a calm lilac card ("پیشنهاد این هفته").
6. Low data → no judgment.

7. Habit loop without fear — see `docs/product.md` (three rituals: after workout / morning / weekly).

Examples (from the mockups):
- ✅ «هفته‌ی پرکاری بوده؛ ۳۵٪ بیشتر از معمولت. یه روز سبک کمک می‌کنه بدنت این پیشرفت رو جذب کنه.»
- ✅ «بعد از شب‌هایی که بیشتر از ۷ ساعت خوابیدی، تمرین‌هات راحت‌تر و بلندتر بودن.»
- ❌ «آلارم: بار تمرین بالا» / «دیشب کم خوابیدی»

## 8. Visual design

Approved mockups in `docs/mockups/` (open `index.html`). 4 screens at 390×844:
`Main` (today/readiness), `Workout` (single workout detail), `Wrapped` (monthly story), `Import` (first-run export.zip).

Design tokens:
- Ground `#0B0C0E`; surface `#131518` border `#22252A`; raised `#16181B`
- Text `#ECEDEE`; muted `#9BA1A6`
- Accent (tweakable, default) `#FF7A1A`; alternatives `#4CC3FF`, `#C6F432`, `#B9A6FF`
- Positive/info `#4CC3FF` (insight cards bg `#10181D` border `#1D3644`)
- Suggestion lilac `#B9A6FF` (cards bg `#17142A` border `#2E2752`, text `#D6D0EE`)
- Zone colors: Z1 `#3A3F45`, Z2 `#4CC3FF`, Z3 `#B9A6FF`, Z4 `#FF7A1A`, Z5 `#FFD2A8` — named
  گرم‌کردن / استقامت پایه / هوازی / قدرت / اوج (not Z1–Z5 in UI)
- Font Vazirmatn (300–900); radii 16–24px; touch targets ≥ 44px; contrast ≥ 4.5:1
- Style: dark minimal "training notebook" base + "control panel" feel (status lamps, trend lines) +
  light gamification (streak, records, Wrapped). No gradients, no emoji icons (inline stroke SVG).
- Bottom tabs: امروز / تمرین‌ها / روندها / Wrapped

Numbers in the mockups are SAMPLE data.

## 9. Build order

1. **Core + export.zip import**: PWA shell (installable, offline), Dexie schema, Worker streaming parser,
   first-run Import screen with progress, backup/restore. Test parser on a **synthetic export.xml**
   generator (`scripts/`) — the owner's real health data is not shared with the build environment.
2. **Analytics + dashboard**: Today + Workout detail with real data; unit tests for every metric.
3. **Shortcuts + sync**: payload schema, Sync button flow, merge/dedup, inferred workouts, type guessing.
   The Shortcuts themselves are built step by step WITH the owner on his phone (iOS only imports signed
   shortcuts, so provide exact action-by-action instructions in Persian).
4. **Wrapped + polish**: story cards, share/screenshot, empty states, onboarding copy.

Per phase: keep it runnable, test on iPhone Safari (installed mode), keep the owner in the loop on UI copy.

## 10. Conventions

- Code & comments in English; all UI copy in Persian, centralized in one `strings.fa.ts`.
- Pure functions for analytics (`src/analytics/*`), no DB access inside them.
- Times stored as UTC ISO / epoch ms; Jalali only in presentation. Owner's timezone: Asia/Tehran.
