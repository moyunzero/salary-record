# Roadmap: 薪时宝 v1.0

**Milestone:** v1.0 薪时宝 MVP — 核心 + 仪式感 + 小程序上线  
**Phases:** 7 active (Phase 6 Dual Platform cancelled → replaced by Navigation IA)  
**Requirements:** 29 active (3 deferred: PLAT-02, PLAT-03, SHIP-03)  
**Design reference:** `docs/DESIGN.md`

**Platform decision (2026-06-23):** v1 仅微信小程序，放弃 Donut 多端 / iOS App。

---

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Foundation | 可计算、可配置、可存储 | CORE-01–03, SET-01–02 | 4 |
| 2 | Home Experience | 2/2 · UAT 7/7 | Complete | 2026-06-22 |
| 3 | Records & Income | 3/3 · UAT 6/6 | Complete | 2026-06-22 |
| 4 | Ritual & Design | 4/4 | Complete    | 2026-06-22 |
| 5 | Cloud Sync | 4/4 · UAT 7/7 | Complete    | 2026-06-23 |
| 6 | Navigation IA | — | Ready to plan | — |
| 7 | Launch | 小程序提审上线 | SHIP-01–02 | 3 |

---

### Phase 1: Foundation

**Goal:** 建立分层架构、纯 JS 计算核心、引导与本地存储，替换 QuickStart 演示代码。

**Requirements:** CORE-01, CORE-02, CORE-03, SET-01, SET-02

**Success Criteria:**

1. User completes onboarding and salary settings persist across app restarts
2. Core unit tests pass for standard 8h day, 2h overtime, and insurance edge cases
3. `core/` modules have zero `wx.*` dependencies and run in Node test environment
4. QuickStart demo pages removed; project structure matches `docs/DESIGN.md` layout

**Depends on:** —  
**Estimated:** ~1 week

---

### Phase 2: Home Experience

**Goal:** 交付打开率核心页面——实时时薪、环形进度、收工打卡三态机。

**Requirements:** HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, UI-02

**Plans:** 2/2 plans complete · **UAT:** 7/7 pass · **Status:** Complete (2026-06-22)

Plans:

- [x] 02-01-PLAN.md — Clock service hardening: cross-day modal, unit tests, HOME-04 button copy
- [x] 02-02-PLAN.md — HOME-01 breathing animation + UI-02 glassmorphism polish on home

**Success Criteria:**

1. User on home screen sees earned amount update every second while in working state
2. Hourly rate color shifts green → yellow → red as dilution increases past standard hours
3. Ring progress reflects worked vs standard hours with overtime color change
4. User can clock out and home transitions to done state with today's summary
5. Dark glassmorphism tokens applied consistently on home screen

**Depends on:** Phase 1  
**Estimated:** ~1 week

---

### Phase 3: Records & Income

**Goal:** 工时补录、实时预览、周/月趋势与日历历史。

**Requirements:** RECD-01, RECD-02, RECD-03, INCM-01, INCM-02, INCM-03

**Plans:** 3/3 plans complete · **UAT:** 6/6 pass · **Status:** Complete (2026-06-22)

Plans:

- [x] 03-01-PLAN.md — Records service API + aggregate.js + unit tests
- [x] 03-02-PLAN.md — Record page add/edit with live preview & dilution warning
- [x] 03-03-PLAN.md — Income trends (uCharts) + calendar-month + tap-to-edit

**Success Criteria:**

1. User can create and edit records with start/end time validation (end after start)
2. Income preview updates live while editing record times
3. Weekly and monthly trend charts render correctly with uCharts
4. Calendar view shows dots on days with records and opens edit on tap

**Depends on:** Phase 1, Phase 2  
**Estimated:** ~1 week

---

### Phase 4: Ritual & Design System

**Goal:** Streak、钱雨、分享卡、filled_soft 自定义图标，形成仪式感闭环。

**Requirements:** RITL-01, RITL-02, RITL-03, RITL-04, UI-01

**Plans:** 4/4 plans complete

Plans:

- [x] 04-01-PLAN.md — streak.js + clock hooks + unit tests + home/profile streak badge (RITL-01) · wave 1
- [x] 04-04-PLAN.md — filled_soft tab PNG icons + app.json (UI-01) · wave 1
- [x] 04-02-PLAN.md — money-rain component + home orchestration + fix vibrate order (RITL-02, RITL-04) · wave 2
- [x] 04-03-PLAN.md — share-card canvas 2d + modal + share/save (RITL-03) · wave 3 (after 04-02)

**Success Criteria:**

1. Streak displays custom flame icon with tiered visual (cold/warm/hot) — no emoji in UI
2. Money rain animation plays on clock-out (≤30 particles, completes in ~3s)
3. User can generate and preview share card with today's earnings and streak
4. Vibration fires on successful clock-out on supported devices
5. All Tab bar and key UI icons use filled_soft custom assets

**Depends on:** Phase 2  
**Estimated:** ~0.5 week

---

### Phase 5: Cloud Sync

**Goal:** 离线打卡可用，联网后 AES 加密同步至 CloudBase。

**Requirements:** SYNC-01, SYNC-02, SYNC-03, SET-03

**Plans:** 4/4 plans complete · **UAT:** 7/7 pass · **Status:** Complete (2026-06-23)
**Wave 1**

- [x] 05-01-PLAN.md — sync-crypto + sync-merge core, updatedAt/tombstones, unit tests · wave 1

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — cloudfunctions/sync + CloudBase env wiring · wave 2

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-03-PLAN.md — services/sync.js orchestrator + clock/settings/app hooks · wave 3

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 05-04-PLAN.md — Profile toggle, confirm modals, last sync, logout · wave 4

**Success Criteria:**

1. User can clock out offline; record appears locally with `syncedAt: null`
2. Enabling cloud sync uploads AES-encrypted settings and records to CloudBase
3. Conflict between local and cloud record resolves to newer `updatedAt`
4. User can disable cloud sync; app continues fully local

**Depends on:** Phase 1, Phase 3  
**Estimated:** ~0.5 week

---

### Phase 6: Navigation IA

**Goal:** Launch 前将 Tab 收成 **首页 · 我**；记录/收入降级为二级入口；设置迁至子页，避免「我」过长。

**Requirements:** NAV-01（新增，见 `06-CONTEXT.md`）

**Design:** `.planning/phases/XSB-06-navigation-ia/06-CONTEXT.md`

**Plans:** 4/4 planned · **Status:** Ready to execute

Plans:

- [ ] 06-01-PLAN.md — tabBar 2-tab + income→record navigateTo + icon script · wave 1
- [ ] 06-02-PLAN.md — extract `pages/settings` from profile · wave 2
- [ ] 06-03-PLAN.md — profile hub refactor (4 link rows) · wave 3
- [ ] 06-04-PLAN.md — sub-page back nav + page-shell-sub + 06-UAT · wave 4

**Success Criteria:**

1. TabBar 仅 2 项：首页、我
2. 「我」为薄 hub（预览 + 4 入口），首屏可看完
3. `pages/settings` 承载原 Profile 表单与云备份，功能等价
4. record/income 子页可返回；收入日历 → 补录仍可用
5. `npm run test:core` 通过

**Depends on:** Phases 3, 5  
**Estimated:** ~2–3 天

> **Note:** 原 Phase 6「Dual Platform」已于 2026-06-23 取消（v1 仅小程序）。本 Phase 复用编号 6，插入 Launch 之前。

---

### Phase 7: Launch

**Goal:** 合规文档、小程序提审、上架。

**Requirements:** SHIP-01, SHIP-02

**Success Criteria:**

1. Privacy policy published and linked in-app describing local + optional encrypted cloud storage
2. WeChat mini program submitted and approved

**Depends on:** Phases 2–6  
**Estimated:** ~0.5 week

---

## Coverage Validation

- [x] All 29 active v1 requirements mapped to phases
- [x] No orphan phases without requirements
- [x] Dependency order: Foundation → Home → Records → Ritual → Sync → Navigation IA → Launch
- [x] Design doc alignment: `docs/DESIGN.md` M1–M7 milestones（M6/M7 合并为小程序提审）

---
*Roadmap created: 2026-06-22*  
*Last updated: 2026-06-23 — Phase 6 Navigation IA added; Dual Platform cancelled*
