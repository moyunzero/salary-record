---
status: passed
phase: XSB-06-navigation-ia
verified: 2026-06-23
completed: 2026-06-23
score: 6/6
human_uat: 6/6 pass
---

# Phase 6 Verification: Navigation IA

## Must-Haves

| Truth | Status | Evidence |
|-------|--------|----------|
| tabBar lists exactly home and profile | pass | `app.json` tabBar.list length 2 |
| record/income in pages[] not tabBar | pass | `app.json` pages array |
| income calendar → navigateTo record | pass | `income/index.js` onCalendarDayTap |
| settings has full Phase 5 form + cloud UI | pass | `pages/settings/*` |
| profile hub: preview + 4 links, no inline forms | pass | `profile/index.wxml` |
| sub-pages have back nav + page-shell-sub | pass | record/income/settings wxml+js |
| npm run test:core passes | pass | 10 test files ok |

## Automated Checks

```bash
npm run test:core  # PASS
node scripts/generate-tab-icons.js  # 4 icons
grep switchTab miniprogram  # only onboarding → home
```

## Human UAT

6/6 pass — see `06-UAT.md`

## Verdict

**passed** — Phase 6 complete.
