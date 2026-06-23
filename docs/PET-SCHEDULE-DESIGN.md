# 工时猫 + 分段作息 — v1.1 设计文档

> 状态：已确认 | 日期：2026-06-23  
> 范围：Launch 后 v1.1 · 首页像素猫陪伴 + 工作设置分段作息表  
> 素材：`cat-pet/cat 16x16 with text.png` · `cat-pet/palette.gpl`

---

## 1. Understanding Summary

- **目标**：在首页增加像素猫，用**情境状态机**陪用户打卡；猫的「午休 / 该下班 / 太晚」等判断与**工作设置里的分段作息表**一致。
- **用户**：已有薪时宝 v1 用户；配置一次作息后持久化为默认。
- **分段作息**：上午 / 午休 / 下午始终可配；**含夜班**开关默认关，打开后才显示晚休 + 晚班段。
- **每日标准工时**：由时段自动推算 → 写入 `standardHoursPerDay`（稀释 / 时薪 / ring 仍读此字段）。
- **猫**：16×16 sprite sheet，首页固定 down 向放大显示；点击有独立反应 overlay。
- **非目标**：Launch 前不做；无薪豆 / 等级 / 养成经济；猫状态不上云。

---

## 2. Assumptions

| # | 假设 |
|---|------|
| A1 | 时间精度到分钟；v1.1 不支持跨日班次（如 22:00–02:00） |
| A2 | 「太晚」加班 L3：超过最后上班段结束 + 2h，或 wall clock ≥ 23:00（取先到者） |
| A3 | 老用户无 `workSchedule` → 迁移为 09–12 / 12–13 / 13–18，`nightShiftEnabled: false`，等价 8h |
| A4 | 首页猫显示 64×64（16×4 scale），位置在 ring 下方、主 CTA 上方 |
| A5 | v1.1 仅使用 sprite 的 down/right 方向，不上 8 向行走 |
| A6 | DAU < 1 万；猫动画低帧率（4–8fps idle），不影响冷启动 < 1s |

---

## 3. Decision Log

| # | 决策 | 备选 | 理由 |
|---|------|------|------|
| D1 | 时间边界跟 settings（B） | 固定钟点（A） | 与用户真实作息一致 |
| D2 | 夜班段可选开关（A） | 始终五段（B） | 大多数用户无夜班，减表单负担 |
| D3 | `standardHoursPerDay` 由 schedule 推导 | 滑块与 schedule 并存 | 单一真相，避免稀释计算打架 |
| D4 | 加班 vs 晚班分离 | 合并为「晚上」 | 晚班是计划内；加班才是提醒收工 |
| D5 | 上班中 cat 用 REST/WASH，不用 WALK | 全程 WALK | 陪岗感；WALK 留给上班前 |
| D6 | 加班 L3 用 HISS + PAW ATTACK | 仅 MEOW | sprite 已有分级；更强但不挡操作 |
| D7 | v1.1 上线，不阻塞 Phase 7 Launch | Launch 前做 | 控制提审范围 |

---

## 4. 分段作息数据模型

### 4.1 Settings 扩展

```js
// 存入 xsb_settings，与现有字段合并
{
  // 现有字段保留 …
  workSchedule: {
    morning:   { start: '09:00', end: '12:00' },
    lunch:     { start: '12:00', end: '13:00' },
    afternoon: { start: '13:00', end: '18:00' },
    eveningRest: { start: '18:00', end: '19:00' },  // nightShiftEnabled 时有效
    nightWork:   { start: '19:00', end: '22:00' },  // nightShiftEnabled 时有效
  },
  nightShiftEnabled: false,
  standardHoursPerDay: 8,  // 只读展示，保存时由 compute 覆盖
}
```

### 4.2 推导每日工时

```js
// core/work-schedule.js
function computeDailyWorkHours(schedule, nightShiftEnabled) {
  const blocks = [schedule.morning, schedule.afternoon];
  if (nightShiftEnabled) blocks.push(schedule.nightWork);
  return blocks.reduce((h, b) => h + minutesBetween(b.start, b.end) / 60, 0);
}
```

**校验规则（保存前）**

- 各段 `start < end`（同日）
- 段与段不重叠：`morning.end ≤ lunch.start`，`lunch.end ≤ afternoon.start`，若开夜班则 `afternoon.end ≤ eveningRest.start`，`eveningRest.end ≤ nightWork.start`
- 推导结果 `standardHoursPerDay` 在 4–16 之间，否则 toast 提示

### 4.3 迁移

```js
function migrateSettings(stored) {
  if (stored.workSchedule) return stored;
  return {
    ...stored,
    workSchedule: {
      morning:   { start: stored.workStartTime || '09:00', end: '12:00' },
      lunch:     { start: '12:00', end: '13:00' },
      afternoon: { start: '13:00', end: '18:00' },
      eveningRest: { start: '18:00', end: '19:00' },
      nightWork:   { start: '19:00', end: '22:00' },
    },
    nightShiftEnabled: false,
    standardHoursPerDay: stored.standardHoursPerDay ?? 8,
  };
}
```

---

## 5. 日历情境判定

```js
// core/pet-context.js — 输入 appState, now, settings → context + escalationLevel

type AppState = 'idle' | 'working' | 'done';
type PetContext =
  | 'beforeWork'   // 上班前
  | 'onShift'      // 上班中（上午/下午/晚班段内）
  | 'lunch'        // 午休段
  | 'dinner'       // 晚休段（通常 idle）
  | 'nightShift'   // 晚班段 + working
  | 'overtime'     // 计划外仍 working
  | 'done';        // 已收工

type Escalation = 0 | 1 | 2 | 3 | 4;  // 0=无，1=yawn，2=meow，3=hiss/attack，4=sad
```

### 5.1 判定顺序（高优先级优先）

| 顺序 | 条件 | context | escalation |
|------|------|---------|------------|
| 1 | `appState === 'done'` | done | 0 |
| 2 | `appState === 'working'` 且不在任一段内 | overtime | 见 5.2 |
| 3 | `appState === 'working'` 且不在段内但 `now` 在午休 | lunch + 提醒 | 0（每 60s MEOW） |
| 4 | `now` 在 lunch 段 | lunch | 0 |
| 5 | `nightShiftEnabled` 且 `now` 在 eveningRest 且 idle | dinner | 0 |
| 6 | `appState === 'working'` 且 `now` 在 nightWork 段 | nightShift | 0 |
| 7 | `appState === 'working'` 且 `now` 在 morning/afternoon 段 | onShift | 0 |
| 8 | `appState === 'idle'` 且 `now` < morning.start | beforeWork | 0 |
| 9 | 其他 idle | beforeWork* | 0 |

\*非上班前 idle（如周末打开）仍走 WALK/REST 池，与 beforeWork 动画相同。

### 5.2 加班 escalation

设 `lastEnd` = 当日最后一段**上班**结束时刻（afternoon.end，或开夜班时 nightWork.end）。

| Level | 条件 |
|-------|------|
| L1 | working 且 `now > lastEnd` 且超出 ≤ 60min |
| L2 | 超出 60–120min |
| L3 | 超出 > 120min **或** `now ≥ 23:00` |
| L4 | L3 持续 > 10min |

---

## 6. 猫动画状态机（context → sprite 池）

### 6.1 各情境默认 loop

| context | 主动画 | 轮换 | 周期 |
|---------|--------|------|------|
| **beforeWork** | WALK down | REST sit · EAT down（10%） | 20s / 8s |
| **onShift** | REST sit | WASH sit · ITCH（15%） | 25s / 8s |
| **lunch** | EAT down | SLEEP sleep2 · REST lie | 15s / 20s |
| **dinner** | EAT down | REST sit · WASH sit | 15s / 12s |
| **nightShift** | REST sit | YAWN sit（45s 一次）· WASH | 30s |
| **overtime L1** | YAWN sit/stand | — | loop |
| **overtime L2** | MEOW stand | YAWN | 12s |
| **overtime L3** | HISS → PAW ATTACK down | 各 3s | 交替 |
| **overtime L4** | sad face 帧 | PAW ATTACK 偶尔 | — |
| **done** | SLEEP sleep1/sleep4 | REST lie | 30s |

### 6.2 用户点击 `onTap`（overlay 2–3s，冷却 8s）

| 当前 context | 反应池 |
|--------------|--------|
| beforeWork / onShift / nightShift | MEOW stand 70% · PAW ATTACK 20% · ITCH 10% |
| lunch / dinner | MEOW sit · EAT 1 cycle |
| overtime L1–L2 | MEOW · YAWN |
| overtime L3+ | PAW ATTACK playful · HISS 1 帧 |
| done | REST lie 睁眼 · SLEEP 微动 |

### 6.3 Sprite 命名约定（组件内部）

```
{action}_{pose}_{direction}
例：rest_sit_down, walk_down_0..3, eat_down_0..3, yawn_sit_down, meow_stand_down,
    hiss_left, paw_attack_down_0..3, sleep1_l_down, sad_sit_down
```

素材从 `cat 16x16 with text.png` 按色条切图导出至 `miniprogram/assets/cat-pet/`。

---

## 7. 架构

```
miniprogram/
├── core/
│   ├── work-schedule.js    # 段校验、computeDailyWorkHours、resolveSegment(now)
│   └── pet-context.js      # resolvePetContext(appState, now, settings)
├── components/
│   └── cat-pet/
│       ├── index.js        # canvas 2d 帧动画 + onTap
│       ├── index.wxml
│       ├── index.wxss
│       └── index.json
├── pages/
│   ├── home/index.*        # <cat-pet context="{{petContext}}" escalation="{{...}}" />
│   └── settings/index.*    # 分段 time-picker UI + 夜班开关
└── assets/cat-pet/         # 切图后的 PNG 序列或 atlas JSON
```

### 7.1 Home 集成

- `onShow` / timer tick（与金额刷新同频或 1s）调用 `resolvePetContext`
- 猫组件 props：`context`, `escalation`, `appState`
- 不阻塞「开始上班 / 我已收工」按钮

### 7.2 Settings UI（工作制度卡片内）

**默认展示（夜班关）**

```
上午上班  [09:00] – [12:00]
午休      [12:00] – [13:00]
下午上班  [13:00] – [18:00]
每日标准工时  8.0 小时（自动计算，只读）

[ ] 含夜班（晚休 + 晚上上班）
```

**夜班开**

```
… 同上 …
晚休      [18:00] – [19:00]
晚上上班  [19:00] – [22:00]
每日标准工时  11.0 小时（自动计算）
```

移除原「每日标准工时」滑块；保留「每月工作天数」滑块。

**预设快捷项**（可选）：法定双休 9–18、大小周等同现有 WORK_PRESETS，点选填充三段。

### 7.3 Onboarding

v1.1 可不改 onboarding 第一步；首启仍用默认 schedule。  
或 onboarding 增加一步「你的作息」（与 settings 同表单）——**实现时二选一，默认仅 settings 可配**。

---

## 8. 与现有系统衔接

| 模块 | 变更 |
|------|------|
| `dilution.js` / `clock.js` | 无逻辑改；仍读 `standardHoursPerDay` |
| `saveSettings` | 保存 schedule 时 `computeDailyWorkHours` 写回 |
| 云同步 | schedule 字段随 settings 加密同步 |
| Phase 7 Launch | **无依赖** |

---

## 9. 测试要点

| # | 场景 |
|---|------|
| T1 | 默认 schedule 推导 8h，稀释与改前一致 |
| T2 | 开夜班 19–22 → 11h，时薪下降 |
| T3 | working @ 12:30 → lunch / EAT |
| T4 | working @ 19:00 夜班段 → nightShift / REST |
| T5 | working @ 19:00 无夜班 → overtime L2 / MEOW |
| T6 | working @ 23:30 → overtime L3 / HISS |
| T7 | tap 冷却 8s |
| T8 | done → SLEEP |
| T9 | 老用户迁移 schedule 无报错 |

---

## 10. 工作量粗估

| 包 | 估时 |
|----|------|
| work-schedule + settings UI | 2–3 天 |
| sprite 切图 + cat-pet 组件 | 2–3 天 |
| pet-context FSM + home 集成 | 1–2 天 |
| 测试 + UAT | 1 天 |
| **合计** | **约 6–9 天** |

---

## 11. 建议 Roadmap 占位

Launch 完成后新增 Phase（示例）：

- **Phase 8: Pet Companion** — workSchedule + cat-pet FSM  
- 需求 ID 建议：`COMP-01`（陪伴猫）、`SET-03`（分段作息）

---

*Design locked: 2026-06-23 · Brainstorming confirmed by user*
