---
phase: 6
slug: navigation-ia
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-23
---

# Phase 6 — Security（Navigation IA）

> 导航 IA 阶段威胁登记、已接受风险与审计记录。

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Tab ↔ sub-page | 首页/我为 Tab；record/income/settings 为栈页 | 无新数据类型；路由边界变更 |
| Profile hub → settings | hub 只读预览；写操作仅在 settings | getSettings 读；saveSettings 写 |
| Deep link → sub-pages | 微信可直达非 Tab 页 | 本地 storage 读写（同 v1） |
| settings → sync | 云备份逻辑自 profile 迁移，API 不变 | 复用 Phase 5 sync 边界 |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01 | Tampering | app.json routes | mitigate | tabBar 仅 home/profile；record/income 移出 tabBar；grep 确认仅 onboarding 使用 switchTab | closed |
| T-06-02 | Tampering | settings save | mitigate | `pages/settings` 复用 `saveSettings` 服务；无新 storage key | closed |
| T-06-03 | Denial of service | hub onShow | accept | hub 仅 `getSettings` + `getLastSyncAt`；无网络/重计算 | closed |
| T-06-04 | Spoofing | deep link sub-pages | accept | 子页无独立鉴权面；敏感写操作仍经 settings/saveSettings；与 v1 等价 | closed |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-03 | hub onShow 为轻量本地读；无额外 DoS 面 | gsd-secure-phase | 2026-06-23 |
| AR-06-02 | T-06-04 | 微信小程序子页可被分享/直达；数据仍存本地，无服务端新暴露 | gsd-secure-phase | 2026-06-23 |

---

## Verification Evidence

| Threat | Evidence |
|--------|----------|
| T-06-01 | `app.json` tabBar.list 长度 2；`grep switchTab miniprogram` 仅 `onboarding/index.js` |
| T-06-02 | `settings/index.js` L4 `saveSettings`；L228 `onSave` 调用 unchanged service |
| T-06-03 | `profile/index.js` `onShow` → `refreshPreview` + `refreshSettingsHint`（仅 getSettings/getLastSyncAt） |
| T-06-04 | record/income 仅读写 clock 服务；settings 复用 Phase 5 云同步 confirm modal 路径 |

**Automated tests:** `npm run test:core` — 全通过（2026-06-23）  
**Human UAT:** `06-UAT.md` — 6/6 pass (2026-06-23)

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-23 | 4 | 4 | 0 | gsd-secure-phase / inline verification |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-23
