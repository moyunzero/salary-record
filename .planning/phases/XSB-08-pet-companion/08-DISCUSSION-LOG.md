# Phase 8 Discussion Log

**Date:** 2026-06-23  
**Mode:** Accelerated — pre-discussed in brainstorming session + `docs/PET-SCHEDULE-DESIGN.md`

---

## Session Summary

Phase 8 was not in ROADMAP at discuss start. User ran `/gsd-discuss-phase 8` after completing brainstorming for「工时猫 + 分段作息」. Most gray areas were resolved in that session; this log records the decision trail.

---

## Areas Covered (pre-discuss-phase)

### 1. 分段作息边界

- **Question:** 固定钟点 vs 跟 settings？
- **Answer:** B — 跟用户 workSchedule
- **Follow-up:** 五段结构 + 夜班开关 A（默认关）

### 2. 猫状态机

- **Question:** 纯装饰 vs 情境反应？
- **Answer:** 情境 FSM，绑定 appState + schedule
- **Follow-up:** 基于 sprite sheet 重设计 7 情境 + 点击 + 加班 L1–L4

### 3. 标准工时来源

- **Question:** 滑块 vs 推导？
- **Answer:** schedule 推导 → standardHoursPerDay 只读

### 4. Onboarding

- **Question:** 首启配置作息？
- **Answer:** 默认不改 onboarding；settings 可配（D-05）

### 5. Launch 时机

- **Question:** 现在做 vs Launch 后？
- **Answer:** v1.1 / Phase 8 after Launch（D-07）

---

## Deferred During Brainstorming

| Idea | Reason |
|------|--------|
| 薪豆/养成 | v1.1 非目标 |
| 8 向 walk | 复杂度，v1.1 仅 down |
| onboarding 作息步 | 默认 settings；可 v1.2 |

---

## Claude's Discretion (logged)

- Sprite atlas 组织
- Time picker 控件选型
- 单测 mock 时间方案

---

*Logged: 2026-06-23*
