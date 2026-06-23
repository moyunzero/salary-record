---
status: pending
phase: XSB-07-pet-companion
source: [docs/PET-SCHEDULE-DESIGN.md §9, 07-05-SUMMARY.md]
started: 2026-06-23T00:00:00.000Z
updated: 2026-06-23T00:00:00.000Z
---

# Phase 7 Pet Companion — UAT Checklist

Run `npm run test:core` before manual UAT. Automated suite covers `work-schedule`, `pet-context`, `dilution`, and related services.

## Automated Gate

| Check | Command | Expected |
|-------|---------|----------|
| Core suite | `npm run test:core` | All tests pass (work-schedule + pet-context + dilution + full suite) |

## Manual Smoke Tests

| # | Scenario | Steps | Expected | Pass/Fail |
|---|----------|-------|----------|-----------|
| T1 | Default schedule 8h dilution unchanged | 1. Fresh/default settings (9–12 / 13–18, 8h standard)<br>2. Start work 09:00, clock out 17:00<br>3. Compare earned & dilution vs pre-phase baseline | Earned ≈ baseHourly × 8; dilution near 0% at 8h; no regression from schedule migration | [ ] |
| T2 | Night shift 19–22 → 11h hourly drop | 1. Settings → enable 夜班, set evening 19:00–22:00<br>2. Confirm standard hours shows 11h<br>3. Work full day including night block | Base hourly lower than 8h-only schedule; dilution math uses 11h standard | [ ] |
| T3 | Working 12:30 → lunch cat | 1. Start work before 12:00<br>2. At 12:30 observe home cat | Cat context `lunch`; EAT / eat animation playing | [ ] |
| T4 | Working 19:00 with night → nightShift REST | 1. Enable night shift in settings<br>2. Start work, remain working at 19:00 | Cat context `nightShift`; rest/sit animation (not overtime) | [ ] |
| T5 | Working 19:00 no night → overtime MEOW | 1. Night shift off<br>2. Start work, remain working at 19:00 | Cat context `overtime` L1; MEOW / alert animation | [ ] |
| T6 | Working 23:30 → overtime L3 HISS | 1. Start work early, stay past 23:30 (or dev mock overtime)<br>2. Observe cat at 23:30+ | Cat context `overtime` escalation ≥ 3; HISS animation | [ ] |
| T7 | Tap cooldown 8s | 1. Tap cat rapidly on home<br>2. Note overlay response timing | First tap triggers overlay; repeats within 8s ignored | [ ] |
| T8 | Done → SLEEP animation | 1. Complete clock-out ritual<br>2. Return to home in done state | Cat context `done`; sleep animation loop | [ ] |
| T9 | Legacy user migration | 1. Simulate/clear settings to pre-schedule storage (or first open after upgrade)<br>2. Open app and visit settings | No crash; settings shows work schedule segments; home loads cat | [ ] |

## Layout Checks (D-10)

| # | Scenario | Steps | Expected | Pass/Fail |
|---|----------|-------|----------|-----------|
| L1 | CTA tappable with cat visible | 1. Home in idle/working/done<br>2. Tap「开始上班」or「我已收工」below cat | Button responds; cat does not block primary CTA hit target | [ ] |
| L2 | Cat visible in idle | 1. Cold start home before work | Cat shown (beforeWork walk/rest); not hidden by wx:if | [ ] |

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0
blocked: 0

## Gaps

<!-- Record failures and follow-up here -->
