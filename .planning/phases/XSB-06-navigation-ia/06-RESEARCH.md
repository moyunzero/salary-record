# Phase 6: Navigation IA — Research

**Researched:** 2026-06-23  
**Source:** 06-CONTEXT.md + codebase audit

---

## 1. WeChat tabBar Constraints

- **Min 2, max 5** tabs; **2–4 recommended** for thumb reach ([设计指南](https://developers.weixin.qq.com/miniprogram/design)).
- Pages in `tabBar.list` **must** use `wx.switchTab`; non-tab pages use `wx.navigateTo` / `navigateBack`.
- Demoting `record` / `income` from tabBar **requires** changing every `switchTab` targeting them (currently **one** call site).

---

## 2. Current Routing Inventory

| File | Call | Target | Action |
|------|------|--------|--------|
| `pages/income/index.js` | `switchTab` | `/pages/record/index` | → `navigateTo` |
| `pages/onboarding/index.js` | `switchTab` | `/pages/home/index` | keep (home stays tab) |

No other `switchTab` / `navigateTo` to record/income/profile in miniprogram.

---

## 3. Profile → Hub + Settings Split

**Current profile** (~260 lines JS, ~150 WXML): preview + full form + cloud sync + save.

**Split strategy (low risk):**

1. Create `pages/settings/index.{js,wxml,wxss,json}` — **copy** profile form/cloud blocks + `onSave` / sync handlers.
2. Slim `pages/profile` to: preview + `refreshCloudSyncUI` (read-only summary) + 4 link rows + navigators.
3. Hub `onShow` calls `refreshCloudSyncUI()` for cloud summary line only.

**Preserve:** `profile/index.js` `onSave` fix (`syncNow().finally(refreshCloudSyncUI)`) moves to **settings** page.

---

## 4. Sub-Page Navigation

All target pages already use `navigationStyle: custom` — no default back button.

**Recommended:** Add reusable pattern in `ui.wxss`:

```css
.sub-nav { /* statusBarHeight spacer + back row */ }
.sub-nav-back { /* ‹ + title */ }
```

Each sub-page WXML:

```xml
<view class="sub-nav" style="padding-top: {{statusBarHeight}}px">
  <view class="sub-nav-back" bindtap="onBack">‹ 工时记录</view>
</view>
```

`onBack()` → `wx.navigateBack({ delta: 1 })`.

**Stack depth:** 我 → 收入 → 记录 = 3 levels — acceptable for occasional flows.

---

## 5. Page Shell Padding

| Class | Use |
|-------|-----|
| `page-shell-tab` | home, profile (tab pages) |
| `page-shell-sub` (new) | record, income, settings — bottom `48rpx + safe-area` only (no tab bar reserve) |

Remove `page-shell-tab` from record/income when demoted.

---

## 6. Tab Icons

`scripts/generate-tab-icons.js` currently generates 4 pairs. **Trim** to `home` + `profile` only; delete or stop generating `tab-record`, `tab-income` (optional cleanup).

`app.json` tabBar.list: 2 entries only.

---

## 7. app.json pages Order

Register `pages/settings/index` in `pages` array (not tabBar). Suggested order:

```
home, onboarding, profile, settings, record, income
```

(tab pages first; subpages after)

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Cloud sync UAT path changed | Update 05-UAT smoke paths in 06-UAT after execute |
| Profile hub missing preview refresh | `onShow` reload settings for hourly preview |
| Calendar → record broken | Test `editRecordDate` + `navigateTo` |
| Deep stack confusion | Sub-nav back always `navigateBack` one level |

---

## 9. Testing

- `npm run test:core` — should remain green (no core changes expected)
- Manual smoke: 6 cases in 06-CONTEXT.md

---

*Phase: XSB-06-navigation-ia · Research complete*
