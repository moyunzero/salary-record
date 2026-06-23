# Requirements: 薪时宝

**Defined:** 2026-06-22  
**Core Value:** 用户每天打开 App，能直观看到「多工作 1 小时，实际少赚多少钱」，并一键收工打卡。

## v1 Requirements

### Core Calculation

- [ ] **CORE-01**: System calculates daily earned amount from salary, insurance rates, and work hours
- [ ] **CORE-02**: System calculates effective hourly rate with dilution when work exceeds standard hours per day
- [ ] **CORE-03**: Clock records persist calculation snapshots (earned, effectiveHourly, dilutionPct) independent of later setting changes

### Onboarding & Settings

- [ ] **SET-01**: User completes onboarding with monthly salary, insurance rates, and standard daily hours before first clock-out
- [ ] **SET-02**: User can update monthly salary, insurance rates, and standard work hours in profile settings
- [x] **SET-03**: User can enable or disable cloud sync in settings
- [x] **SET-04**: User can configure segmented daily work schedule (morning/lunch/afternoon, optional night shift) that derives standard hours per day

### Home Experience

- [x] **HOME-01**: User sees today's earned amount with breathing animation on the home screen
- [x] **HOME-02**: User sees real-time hourly rate with color gradient reflecting dilution level
- [x] **HOME-03**: User sees ring progress showing worked hours versus standard daily hours
- [x] **HOME-04**: User can clock out with one-tap「我已收工」button
- [x] **HOME-05**: Home screen correctly displays idle, working, and done states

### Work Records

- [x] **RECD-01**: User can add and edit work records with start and end times
- [x] **RECD-02**: User sees live income preview when editing a work record
- [x] **RECD-03**: User sees overtime dilution warning when editing hours beyond standard

### Income Analytics

- [x] **INCM-01**: User can view weekly and monthly income trend charts
- [x] **INCM-02**: User can browse clock history in a calendar view
- [x] **INCM-03**: User can edit records from the calendar view

### Ritual & Engagement

- [x] **RITL-01**: User sees consecutive clock-out streak count with custom flame icon (not emoji)
- [x] **RITL-02**: User sees money rain animation on successful clock-out
- [x] **RITL-03**: User can preview and share a clock-out card image
- [x] **RITL-04**: User receives vibration feedback on successful clock-out

### Pet Companion

- [ ] **COMP-01**: User sees a contextual pixel cat on the home screen that reflects work state and schedule (idle, on shift, lunch, overtime, done)

### Data & Sync

- [x] **SYNC-01**: User can clock out and view records while offline
- [x] **SYNC-02**: User data syncs to CloudBase with AES-encrypted payload when cloud sync is enabled
- [x] **SYNC-03**: Sync conflicts resolve using updatedAt (newer record wins)

### Platform (WeChat Mini Program Only)

- [ ] **PLAT-01**: App delivers full v1 feature set on WeChat mini program

~~**PLAT-02**~~、~~**PLAT-03**~~ — v1 不做（见 Out of Scope）

### Design System

- [x] **UI-01**: App uses filled_soft custom icons throughout with no emoji as UI elements
- [x] **UI-02**: App applies dark glassmorphism design tokens consistently across screens

### Launch & Compliance

- [ ] **SHIP-01**: Privacy policy documents local storage and optional encrypted cloud backup
- [ ] **SHIP-02**: WeChat mini program is submitted and passes platform review

~~**SHIP-03**~~ — v1 不做（见 Out of Scope）

## v2 Requirements

Deferred to v1.1+.

### Engagement

- **NOTF-01**: User receives gentle clock-out reminders via subscription messages
- **GAME-01**: User earns薪豆 for streaks and can redeem themes
- **SOCL-01**: User can view anonymous city hourly-rate leaderboard

### AI

- **AI-01**: User receives AI-generated daily work-life balance tips

### Platform

- **PLAT-04**: Android App published via Donut multi-platform framework

## Out of Scope

| Feature | Reason |
|---------|--------|
| iOS / Android App（Donut 多端） | v1 仅微信小程序（2026-06-23 决策） |
| AI 智能助手 | Deferred to v1.1; not needed to validate core retention loop |
| 匿名时薪榜 | Requires backend moderation and compliance review |
| 薪豆 / 成就系统 | Game economy adds scope; validate ritual loop first |
| 订阅变现 | Needs payment integration and pricing validation |
| PDF 导出 | Low priority vs mini program launch |
| 多账户 | Single-user focus for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Pending |
| CORE-02 | Phase 1 | Pending |
| CORE-03 | Phase 1 | Pending |
| SET-01 | Phase 1 | Pending |
| SET-02 | Phase 1 | Pending |
| HOME-01 | Phase 2 | Complete |
| HOME-02 | Phase 2 | Complete |
| HOME-03 | Phase 2 | Complete |
| HOME-04 | Phase 2 | Complete |
| HOME-05 | Phase 2 | Complete |
| UI-02 | Phase 2 | Complete |
| RECD-01 | Phase 3 | Pending |
| RECD-02 | Phase 3 | Pending |
| RECD-03 | Phase 3 | Pending |
| INCM-01 | Phase 3 | Pending |
| INCM-02 | Phase 3 | Pending |
| INCM-03 | Phase 3 | Pending |
| RITL-01 | Phase 4 | Complete |
| RITL-02 | Phase 4 | Complete |
| RITL-03 | Phase 4 | Complete |
| RITL-04 | Phase 4 | Complete |
| UI-01 | Phase 4 | Complete |
| SYNC-01 | Phase 5 | Complete |
| SYNC-02 | Phase 5 | Complete |
| SYNC-03 | Phase 5 | Complete |
| SET-03 | Phase 5 | Complete |
| SET-04 | Phase 7 | Complete |
| COMP-01 | Phase 7 | Pending |
| PLAT-01 | Phases 1–8 | Pending |
| SHIP-01 | Phase 8 | Pending |
| SHIP-02 | Phase 8 | Pending |

**Deferred (Out of Scope v1):** PLAT-02, PLAT-03, SHIP-03, PLAT-04

**Coverage:**

- v1 active requirements: 31
- Mapped to phases: 31
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-22*  
*Last updated: 2026-06-23 — Phase 7/8 reorder; COMP-01, SET-04 added*
