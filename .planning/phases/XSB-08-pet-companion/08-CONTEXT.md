# Phase 8: Pet Companion — Context & Design

**Gathered:** 2026-06-23  
**Status:** Ready for planning  
**Source:** Brainstorming session + `docs/PET-SCHEDULE-DESIGN.md`（用户已确认）

---

## Phase Boundary

Launch 后 v1.1：**首页像素猫陪伴**（情境状态机 + sprite 动画）+ **工作设置分段作息表**（推导 `standardHoursPerDay`）。

**In scope**

- `workSchedule` 数据模型 + settings UI（上午/午休/下午 + 可选夜班）
- `core/work-schedule.js` + `core/pet-context.js`
- `components/cat-pet/`（canvas 2d，素材自 `cat-pet/cat 16x16 with text.png`）
- Home 集成（ring 下方 64×64，不挡 CTA）
- 老用户 settings 迁移
- 云同步随 settings 走

**Out of scope**

- 薪豆 / 等级 / 养成经济
- 猫状态单独上云
- 跨日班次（22:00–02:00）
- onboarding 新增作息步（首版仅 settings 可配）
- Launch 前实施（依赖 Phase 7 完成）

---

## Assumptions

| # | 假设 |
|---|------|
| A1 | 时间精度到分钟；v1.1 不支持跨日班次 |
| A2 | 加班 L3：`now > lastEnd + 120min` **或** `now ≥ 23:00`（先到者） |
| A3 | 老用户无 `workSchedule` → 迁移 09–12 / 12–13 / 13–18，8h |
| A4 | 猫 64×64（16×4），ring 下方、主 CTA 上方 |
| A5 | v1.1 仅用 sprite down/right 向 |
| A6 | 动画 4–8fps；冷启动 < 1s；包体增量 ~100–300KB |

---

## Implementation Decisions

### 分段作息（Settings）

- **D-01:** 时间边界跟用户 `workSchedule`（非固定钟点）
- **D-02:** 夜班「含夜班」开关默认关；开才显示晚休 + 晚班段
- **D-03:** `standardHoursPerDay` 由 schedule **推导**，移除原滑块；只读展示
- **D-04:** 保留「每月工作天数」滑块；WORK_PRESETS 可一键填充三段
- **D-05:** 首版 **不改 onboarding**；用户进「工作设置」配置作息

### 猫情境 FSM

- **D-06:** 情境：beforeWork / onShift / lunch / dinner / nightShift / overtime / done
- **D-07:** **加班 vs 晚班分离** — 晚班=计划内段；加班=计划外仍 working
- **D-08:** 上班中 REST/WASH；上班前 WALK/REST/EAT；加班 L1–L4 用 YAWN→MEOW→HISS/ATTACK→sad
- **D-09:** 点击猫：overlay 2–3s，冷却 8s；情境不同反应池（见设计 doc §6.2）
- **D-10:** HISS/ATTACK 为提醒动画，不阻塞收工按钮

### 素材与渲染

- **D-11:** 从 `cat 16x16 with text.png` 按色条切图 → `miniprogram/assets/cat-pet/`
- **D-12:** 组件用 canvas type="2d" 帧动画
- **D-13:** 配色可参考 `cat-pet/palette.gpl`（Zenit-241）

### Claude's Discretion

- sprite atlas JSON vs 多 PNG 组织方式
- settings time-picker 用原生 picker 或自定义行
- 单元测试 mock 时间注入方式

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product & design

- `docs/PET-SCHEDULE-DESIGN.md` — **主设计文档**（数据模型、FSM、架构、测试）
- `docs/DESIGN.md` — v1 产品边界；本 phase 为 v1.1 扩展
- `.planning/PROJECT.md` — 核心 value、out of scope（游戏化 v1.1 外）

### Assets

- `cat-pet/cat 16x16 with text.png` — sprite sheet（REST/WALK/SLEEP/EAT/MEOW/YAWN/WASH/ITCH/HISS/PAW ATTACK/sad）
- `cat-pet/palette.gpl` — 像素调色参考

### Code integration

- `miniprogram/pages/home/index.js` — appState idle/working/done + timer tick
- `miniprogram/pages/settings/index.js` — 工作制度卡片扩展点
- `miniprogram/services/settings.js` — saveSettings / 迁移 hook
- `miniprogram/core/dilution.js` — 仍读 `standardHoursPerDay`
- `miniprogram/constants/presets.js` — WORK_PRESETS 扩展

### Prior phase

- `.planning/phases/XSB-06-navigation-ia/06-CONTEXT.md` — 首页专注打卡、settings 子页

---

## Existing Code Insights

### Reusable Assets

- `components/money-rain/` — 首页 overlay 组件模式
- `components/trend-chart/` — 轻量 canvas/自定义绘制参考
- `behaviors/safe-area` — 首页已有
- `pages/settings` 工作制度 card + slider 模式

### Established Patterns

- 计算逻辑放 `core/`，页面 thin
- settings 变更 → `saveSettings` → 可选云同步
- 自定义 nav + dark glass（`ui.wxss`）
- 禁止 emoji UI；像素 sprite 符合 filled_soft 资产方向

### Integration Points

- Home WXML：`<cat-pet>` 插入 ring 与 CTA 之间
- Home JS：tick 时 `resolvePetContext(state, now, getSettings())`
- Settings：替换 standardHours 滑块为分段 picker + 推导展示
- `getSettings()` 入口加 migrateSettings

---

## Specific Ideas

- 用户描述：午休猫 rest/walk/sleep；晚上加班 yawn/meow；太晚 attack/sleep；点击有互动
- sprite 已按色条分区，设计 doc §6 有完整 context→动画映射表
- 猫是「情感化收工提醒」，不是独立玩法

---

## Success Criteria

1. 分段作息保存后 `standardHoursPerDay` 自动正确；稀释/时薪一致
2. 7 种情境 + 加班 L1–L4 动画正确（见设计 doc §9 测试表）
3. 点击冷却 8s；不挡开始/收工
4. 老用户迁移无报错；云同步含 schedule
5. `npm run test:core` 通过 + 新增 work-schedule / pet-context 单测

---

## UAT Smoke（建议 9 条）

见 `docs/PET-SCHEDULE-DESIGN.md` §9（T1–T9）

---

## Deferred Ideas

- onboarding 增加「你的作息」一步 — v1.2 若反馈 settings 发现率低
- 8 方向 walk（首页猫走动） — 非 v1.1
- 猫名字/换肤 — 非 v1.1
- 跨日夜班 — 非 v1.1

---

*Phase: XSB-08-pet-companion · Context gathered: 2026-06-23*
