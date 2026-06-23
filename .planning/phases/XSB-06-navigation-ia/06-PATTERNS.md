# Phase 6: Navigation IA — Pattern Map

**Mapped:** 2026-06-23  
**Analogs:** profile split, existing page shells, Phase 5 profile sync UX

## File Classification

| New/Modified File | Role | Closest Analog | Match |
|-------------------|------|----------------|-------|
| `miniprogram/app.json` | config | self (04-04 tab icons) | exact |
| `pages/settings/index.*` | controller | `pages/profile/index.*` | exact (extract) |
| `pages/profile/index.*` | controller | hub list pattern (`sync-logout` row) | role-match |
| `pages/record/index.wxml` | view | self + add `sub-nav` | partial |
| `pages/income/index.wxml` | view | self + add `sub-nav` | partial |
| `miniprogram/styles/ui.wxss` | styles | `.page-shell-tab`, `.sync-logout` | exact (extend) |
| `scripts/generate-tab-icons.js` | script | self | exact (trim) |

---

## Profile Hub Pattern

**Analog:** `.sync-logout` row in profile WXML + `section-head` cards

**Apply:**

```xml
<view class="profile-link-row" bindtap="onGoRecord">
  <view class="profile-link-main">
    <text class="profile-link-title">工时记录</text>
    <text class="profile-link-hint">补录或修改历史工时</text>
  </view>
  <text class="profile-link-chevron">›</text>
</view>
```

Four rows in one `card` under preview-card.

**JS navigators:**

```javascript
onGoRecord() { wx.navigateTo({ url: '/pages/record/index' }); },
onGoIncome() { wx.navigateTo({ url: '/pages/income/index' }); },
onGoSettings() { wx.navigateTo({ url: '/pages/settings/index' }); },
```

Cloud summary row: reuse `refreshCloudSyncUI` data; tap → `onGoSettings()`.

---

## Settings Page Pattern

**Analog:** Current `pages/profile/index.js` + WXML blocks from line 22 onward (salary card through save button)

**Migration checklist:**

- Move: insurance/work presets, sliders, cloud sync card, `onSave`, `onToggleCloudSync`, `onLogoutCloud`
- Keep in profile: `updatePreview`, preview card fields, `refreshCloudSyncUI` (summary only)
- Share: `behaviors/safe-area`, `formatMoney`, preset constants

**JSON:** `{ "navigationStyle": "custom", "backgroundColor": "#0a101f" }` — same as profile

---

## Sub-Nav Pattern

**Analog:** Tab pages use `status-bar` + `page-header`; sub-pages add back row above `page-header`

```xml
<view class="status-bar" style="height: {{statusBarHeight}}px"></view>
<view class="sub-nav-bar">
  <view class="sub-nav-back" bindtap="onBack">‹</view>
  <text class="sub-nav-title">工时记录</text>
</view>
```

```javascript
onBack() {
  wx.navigateBack();
},
```

---

## Routing Fix Pattern

**Analog:** `income/index.js` `onCalendarDayTap`

```javascript
// Before
wx.switchTab({ url: '/pages/record/index' });
// After
wx.navigateTo({ url: '/pages/record/index' });
```

---

## Page Shell

**Tab pages (home, profile):** keep `page-shell page-shell-tab page-shell-tab-tight`

**Sub pages:** `page-shell page-shell-sub` — new class:

```css
.page-shell-sub {
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
}
```

---

*Phase: XSB-06-navigation-ia*
