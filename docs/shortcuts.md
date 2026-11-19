# Shortcuts design (iOS 27, verified by owner)

## Verified on the owner's iPhone
- Automation trigger: **Apple Watch Workout → "When any workout is started or ended"** (no type filter).
- `Find Health Samples` types include: Heart Rate, Heart Rate Variability, Resting Heart Rate,
  Active Energy, Sleep, Steps, Exercise Minutes (and many more). **No Workouts type.**
- Workout actions available: Start Workout, Log Workout, End Workout (write-only), Search Fitness+.

## Files (in iCloud Drive / On My iPhone → Shortcuts/nabz/)
- `state.json` — `{"open": true|false, "start": "<ISO>"}`
- `queue.json` — array of pending workout records (see payload)

## 1) Automation «نبض-تمرین» (Run Immediately, no notification)
```
read state.json (create if missing)
if state.open == false OR now - state.start > 4h:
    state = {open: true, start: now}          # START
else:
    end = now                                  # END
    hr  = Find Health Samples: Heart Rate, start ≥ state.start, end ≤ end (all, sorted by start)
    kcal= Find Health Samples: Active Energy, same window → sum
    append {start, end, hr: [[t, bpm]...], activeKcal} to queue.json
    state = {open: false}
write state.json
```
Note: need to verify during build whether Shortcuts loops over thousands of HR samples are fast enough;
if slow, use "Get Details of Health Sample" on the whole list (returns lists) instead of a per-item loop.

## 2) Shortcut «نبض-سینک» (launched from the app)
App opens: `shortcuts://run-shortcut?name=<url-encoded نبض-سینک>&input=text&text=<lastSyncISO>`
```
since = Shortcut Input (ISO date)
workouts = read queue.json
daily:
  restingHR   = Find Health Samples: Resting Heart Rate, start ≥ since
  hrv         = Find Health Samples: Heart Rate Variability, start ≥ since
  sleep       = Find Health Samples: Sleep, start ≥ since (value = stage)
  activeEnergy, exerciseMinutes, steps = Find Health Samples (≥ since)  # app aggregates per day
  heartRate   = Find Health Samples: Heart Rate, start ≥ since           # used for inferred workouts
build dictionary → JSON → Copy to Clipboard
clear queue.json
(optional) show "برگرد به نبض" notification
```

## Payload v1
```json
{
  "v": 1,
  "generatedAt": "2026-11-19T07:30:00Z",
  "since": "2026-11-18T19:00:00Z",
  "workouts": [
    { "start": "ISO", "end": "ISO", "activeKcal": 312.4, "hr": [["ISO", 98], ["ISO", 121]] }
  ],
  "samples": {
    "heartRate":       [["ISO", 72]],
    "restingHR":       [["ISO", 58]],
    "hrvSDNN":         [["ISO", 47.9]],
    "sleep":           [["startISO", "endISO", "core|deep|rem|awake|inBed|asleep"]],
    "activeEnergy":    [["startISO", "endISO", 12.3]],
    "exerciseMinutes": [["startISO", "endISO", 1]],
    "steps":           [["startISO", "endISO", 230]]
  }
}
```
### Accepted shapes (implemented in `src/sync/payload.ts`)
- Each list may be **tuples** (as above), **dictionaries** (`{"date"|"t"|"start", "value"|"v", "end", "source"}`),
  or **columnar** parallel lists (`{"t": [...], "v": [...]}` / `{"start": [...], "end": [...], "v": [...], "source": [...]}`).
  Columnar is what the Shortcuts build uses: "Get Details of Health Samples" on a whole list, no per-item loops.
- `workouts` may be the queue file as-is: `{"items": [...]}`.
- Interval samples and sleep carry an optional `source` so the app can take the max source per day
  (iPhone + Watch steps would otherwise double count).
- Step-by-step Persian build instructions: `docs/shortcuts-guide.fa.md`.

The exact output format of Shortcuts date/number values (locale! the phone may output Persian digits
or localized dates) MUST be checked against a real payload from the owner and normalized in the app's
parser. Be tolerant: accept Persian/Arabic digits and several date formats.
