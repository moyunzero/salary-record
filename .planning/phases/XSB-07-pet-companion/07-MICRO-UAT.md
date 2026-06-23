---
status: pending
phase: XSB-07-pet-companion
wave: 6
source: [07-09-PLAN.md, PET-MICRO-BEHAVIOR.md]
started: 2026-06-23T00:00:00.000Z
updated: 2026-06-23T00:00:00.000Z
---

# Phase 7 Wave 6 — Micro Behavior UAT

> **Note:** Phase 7 regression still requires [07-UAT.md](./07-UAT.md) T1–T9.  
> **Human verify:** pending human verify in DevTools — operator to mark T-M1–T-M8 pass/fail.

Run `npm run test:core` before manual UAT.

## Automated Gate

| Check | Command | Expected |
|-------|---------|----------|
| Core suite | `npm run test:core` | All tests pass (incl. `pet-micro.test.js`) |

## Manual Micro Checks

| # | Scenario | Steps | Expected | Pass/Fail |
|---|----------|-------|----------|-----------|
| T-M1 | Micro variety (no arcId stepping) | 1. DevTools home → pet debug → onShift preset<br>2. Watch debug `microBlockKind` over 2–3 min | Block kinds vary (clip/walk/hold); no `arcId` / step counter in micro mode | [ ] |
| T-M2 | onShift walk ~40% baseline vs offDuty | 1. Compare onShift vs offDuty presets<br>2. Sample ~20 blocks each | onShift walk blocks noticeably less frequent than offDuty | [ ] |
| T-M3 | Excited patrol 3 taps / 30s → 60s ~60% walk | 1. Rapid tap cat 3× within 30s<br>2. Observe debug「兴奋巡视」~60s | Walk-heavy behavior; debug shows excitedPatrol | [ ] |
| T-M4 | Patrol 45s cooldown | 1. After patrol ends, wait 45s<br>2. 3 taps again within 30s | Second patrol does not trigger until cooldown elapsed | [ ] |
| T-M5 | Interest roam (windowsill / catBed / centerRug) | 1. offDuty or done-active preset<br>2. Watch walk targets / debug `interestId` | Cat walks toward interest points; debug shows interestId occasionally | [ ] |
| T-M6 | done-night sleep4 hold | 1. done preset at 23:00 (or mock)<br>2. Wait for sleep4 hold | Cat holds sleep4; spontaneous blocks stop until tap interrupt | [ ] |
| T-M7 | Meow SFX when enabled | 1. Ensure `PET_SFX_ENABLED_KEY` true (default)<br>2. Trigger meow clip or patrol<br>3. Toggle SFX off and repeat | Audible meow on clip/patrol when enabled; silent when disabled | [ ] |
| T-M8 | overtime-L3 gate (no feast / nap / deep sleep) | 1. overtime-L3 preset (escalation 3)<br>2. Observe blocks ~2 min | No eat, nap, settle, or deep sleep blocks; hiss/paw/stress clips OK | [ ] |

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

<!-- Record failures and follow-up here -->
