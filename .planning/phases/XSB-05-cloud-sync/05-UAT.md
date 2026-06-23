---
status: complete
phase: XSB-05-cloud-sync
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md]
started: 2026-06-22T16:30:00.000Z
updated: 2026-06-23T05:10:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Profile toggle off by default
expected: Open Profile —「云端备份」switch is OFF by default (D-02)
result: pass

### 2. Enable cloud sync with confirm modal
expected: Turn ON the switch — a confirm modal appears explaining AES encrypted backup; after confirming, last sync shows a time or「尚未同步」
result: pass

### 3. Save triggers sync update
expected: Change monthly salary and tap Save — after online sync completes, Profile「上次同步」updates (no error toast on failure)
result: pass
note: 初测失败（UI 未刷新），已修复 profile onSave syncNow + refreshCloudSyncUI，重测通过

### 4. Disable sync keeps local data
expected: Turn OFF the switch — confirm modal appears; after confirm, local salary/records still visible; saving no longer triggers cloud sync
result: pass

### 5. Re-enable pulls and merges
expected: Turn ON again — confirm modal, then cloud data merges with local; app shows merged state without data loss
result: pass

### 6. Logout clears session only
expected: Tap「退出登录」— confirm modal; after confirm, sync switch turns off; local records and settings still visible on Home/Records
result: pass

### 7. Offline clock-out silent
expected: With sync enabled, go offline (or airplane mode), clock out on Home — record appears locally; no sync error toast
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "保存设置后 Profile「上次同步」时间应更新"
  status: resolved
  reason: "User reported: 没有更新"
  severity: major
  test: 3
  root_cause: "onSave 触发 scheduleSync 但未在 syncNow 完成后调用 refreshCloudSyncUI"
  fix: "miniprogram/pages/profile/index.js — onSave 保存后 syncNow().finally(refreshCloudSyncUI)"
