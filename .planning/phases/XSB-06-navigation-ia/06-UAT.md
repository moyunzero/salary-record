---
status: complete
phase: XSB-06-navigation-ia
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md]
started: 2026-06-23T08:00:00.000Z
updated: 2026-06-23T09:25:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. 冷启动仅 2 Tab
expected: 冷启动 → 底部 tabBar 仅「首页」「我」
result: pass

### 2. 我 → 工时记录 → 补录保存 → 返回
expected: 我 Tab → 点「工时记录」→ 进入子页（有 ‹ 返回栏）→ 修改时间保存成功 → 点返回回到「我」
result: pass

### 3. 我 → 收入趋势 → 日历 → 记录日期正确
expected: 我 →「收入趋势」→ 点日历某天 → navigateTo 记录页且日期与所选一致（editRecordDate）
result: pass

### 4. 我 → 工作设置 → 改月薪 → 首页时薪更新
expected: 我 →「工作设置」→ 修改月薪并保存 → 返回首页 Tab → 基础/有效时薪反映新月薪
result: pass

### 5. 我 → 工作设置 → 云备份开/关/退出
expected: 工作设置页内：开启云备份（确认弹窗）→ 保存后上次同步更新；关闭开关保留本地数据；退出登录仅清会话
result: pass
note: 云备份路径：我 → 工作设置（hub 上云状态合并在 hint）

### 6. 首页收工流程不受影响
expected: 首页开始上班 → 收工仪式与 Phase 4 一致；无新增步骤或 Tab 切换
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
