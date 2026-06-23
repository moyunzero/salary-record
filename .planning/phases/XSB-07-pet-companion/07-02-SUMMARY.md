---
phase: XSB-07-pet-companion
plan: 02
subsystem: ui
tags: [wechat-miniprogram, settings, work-schedule, time-picker]

requires:
  - phase: XSB-07-pet-companion
    provides: 07-01 work-schedule.js + migrateSettings on getSettings
provides:
  - Settings work card with segmented morning/lunch/afternoon time pickers
  - Night shift toggle with conditional eveningRest/nightWork rows
  - Read-only computedStandardHours derived from computeDailyWorkHours
  - WORK_PRESETS one-tap schedule fill; validateWorkSchedule on save
affects:
  - 07-03 pet-context FSM (reads workSchedule from settings)
  - dilution/clock (standardHoursPerDay recomputed on save)

tech-stack:
  added: []
  patterns:
    - "Native picker mode=time in record-row style for schedule segments"
    - "Live recomputeComputedHours without save; validate only on onSave"

key-files:
  created: []
  modified:
    - miniprogram/pages/settings/index.wxml
    - miniprogram/pages/settings/index.wxss
    - miniprogram/pages/settings/index.js
    - miniprogram/constants/presets.js

key-decisions:
  - "Schedule UI placed inside work fine-tune body (replaces standardHours slider)"
  - "All three WORK_PRESETS share 09–18 default schedule clone for one-tap fill"

patterns-established:
  - "updateScheduleField helper sets selectedWorkPreset to custom on any picker change"
  - "saveSettings passes workSchedule, nightShiftEnabled, and validated standardHoursPerDay"

requirements-completed: [SET-04]

duration: 20min
completed: 2026-06-23
---

# Phase 7 Plan 02: Settings Segmented Schedule UI Summary

**Settings work card with segmented time pickers, night shift toggle, and save-time validateWorkSchedule recomputing standardHoursPerDay**

## Performance

- **Duration:** 20 min
- **Started:** 2026-06-23T08:00:00Z
- **Completed:** 2026-06-23T08:20:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Replaced standardHoursPerDay slider with 6+ native time pickers (morning/lunch/afternoon start/end)
- Night shift switch reveals eveningRest + nightWork pickers; computed hours updates live (8h → 11h)
- WORK_PRESETS extended with workSchedule blocks for one-tap 09–18 fill
- onSave validates schedule, blocks overlap/invalid ranges with toast, persists workSchedule + recomputed hours
- Onboarding pages untouched per D-05

## Task Commits

1. **Task 1: Settings WXML segmented schedule UI** - `4c47432` (feat)
2. **Task 2: Settings JS handlers + save validation** - `91edf88` (feat)

## Files Created/Modified

- `miniprogram/pages/settings/index.wxml` - Segmented schedule rows, night toggle, read-only computed hours
- `miniprogram/pages/settings/index.wxss` - Minimal schedule-row/picker styles matching dark glass tokens
- `miniprogram/pages/settings/index.js` - Picker handlers, recomputeComputedHours, validateWorkSchedule on save
- `miniprogram/constants/presets.js` - WORK_PRESETS workSchedule + nightShiftEnabled for one-tap fill

## Decisions Made

- Schedule UI kept inside existing「微调工时」fine-tune panel — presets handle common cases, fine-tune for custom segments
- Each WORK_PRESETS entry gets independent cloneWorkSchedule() to avoid shared mutation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 07-03 can wire pet-context FSM reading workSchedule/nightShiftEnabled from getSettings
- standardHoursPerDay always derived on save — dilution/clock unchanged
- Manual DevTools check: toggle night shift, verify derived hours 8→11

## Self-Check: PASSED

- FOUND: miniprogram/pages/settings/index.wxml
- FOUND: miniprogram/pages/settings/index.js
- FOUND: miniprogram/constants/presets.js
- FOUND: 4c47432
- FOUND: 91edf88

---
*Phase: XSB-07-pet-companion*
*Completed: 2026-06-23*
