# 工时猫 + 分段作息 — 设计文档

> 状态：已确认 | 日期：2026-06-23  
> 范围：**Phase 7** · Launch 前 · 首页像素猫陪伴 + 工作设置分段作息表  
> 素材：`cat-pet/cat 16x16 with text.png` · `cat-pet/palette.gpl`  
> **状态与时间逻辑速查**：[PET-STATE-AND-TIME.md](./PET-STATE-AND-TIME.md)

---

## 1. Understanding Summary

- **目标**：在首页增加像素猫，用**情境状态机**陪用户打卡；猫的「午休 / 该下班 / 太晚」等判断与**工作设置里的分段作息表**一致。
- **用户**：已有薪时宝 v1 用户；配置一次作息后持久化为默认。
- **分段作息**：上午 / 午休 / 下午始终可配；**含夜班**开关默认关，打开后才显示晚休 + 晚班段。
- **每日标准工时**：由时段自动推算 → 写入 `standardHoursPerDay`（稀释 / 时薪 / ring 仍读此字段）。
- **猫**：16×16 sprite sheet，首页固定 down 向放大显示；点击有独立反应 overlay。
- **非目标**：无薪豆 / 等级 / 养成经济；猫状态不上云；小程序提审（Phase 8）。

---

## 2. Assumptions

| # | 假设 |
|---|------|
| A1 | 时间精度到分钟；首版不支持跨日班次（如 22:00–02:00） |
| A2 | 「太晚」加班 L3：超过最后上班段结束 + 2h，或 wall clock ≥ 23:00（取先到者） |
| A3 | 老用户无 `workSchedule` → 迁移为 09–12 / 12–13 / 13–18，`nightShiftEnabled: false`，等价 8h |
| A4 | 首页猫显示 64×64（16×4 scale），位置在 ring 下方、主 CTA 上方 |
| A5 | 日常 idle 用 `idle_a/b`（2 帧眨眼）；**8 向 `walk_*` 仅用于活动区漫游**，不上岗态主 clip |
| A6 | DAU < 1 万；猫动画低帧率（4–8fps idle），不影响冷启动 < 1s |

---

## 3. Decision Log

| # | 决策 | 备选 | 理由 |
|---|------|------|------|
| D1 | 时间边界跟 settings（B） | 固定钟点（A） | 与用户真实作息一致 |
| D2 | 夜班段可选开关（A） | 始终五段（B） | 大多数用户无夜班，减表单负担 |
| D3 | `standardHoursPerDay` 由 schedule 推导 | 滑块与 schedule 并存 | 单一真相，避免稀释计算打架 |
| D4 | 加班 vs 晚班分离 | 合并为「晚上」 | 晚班是计划内；加班才是提醒收工 |
| D5 | 上班中 cat 用 IDLE/WASH/SCRATCH，不用 WALK 作主 clip | 全程 WALK | 陪岗感；WALK 仅漫游；上班前漫游最频繁 |
| D6 | 加班 L3 用 HISS + PAW ATTACK | 仅 MEOW | sprite 已有分级；更强但不挡操作 |
| D7 | **Phase 7 先做**，Phase 8 再提审 | Launch 后 v1.1 | 猫作为 v1 上架体验的一部分（2026-06-23 决策） |

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

\*非上班前 idle（如周末打开）仍走 `beforeWork` 场景，动画与上班前相同（idle 眨眼 + 漫游）。

### 5.2 加班 escalation

设 `lastEnd` = 当日最后一段**上班**结束时刻（afternoon.end，或开夜班时 nightWork.end）。

| Level | 条件 |
|-------|------|
| L1 | working 且 `now > lastEnd` 且超出 ≤ 60min |
| L2 | 超出 60–120min |
| L3 | 超出 > 120min **或** `now ≥ 23:00` |
| L4 | L3 持续 > 10min |

---

## 6. 猫动画状态机（scene → sprite 池）

> 实现文件：`miniprogram/components/cat-pet/index.js`  
> Clip 定义：`scripts/cat-pet-clips.manifest.json` → `slice-cat-sprites.mjs` → `assets/cat-pet/`

### 6.0 Idle 眨眼（替代 REST）

REST sit/lie **已移除**。主 idle 用两对帧交替实现眨眼：

| clip | 帧 | 含义 |
|------|-----|------|
| `idle_a` | 33, 35 | 睁眼 ↔ 闭眼 |
| `idle_b` | 34, 36 | 偏移一帧的睁眼 ↔ 闭眼 |

`beforeWork` / `onShift` / `nightShift` 在非轮换周期内，通过 `_idleAlt` 在 `idle_a` ↔ `idle_b` 间切换。

### 6.1 各情境默认 loop

| scene | 主动画 | 轮换 | 主周期 / 轮换周期 | 轮换概率 |
|-------|--------|------|-------------------|----------|
| **beforeWork** | `idle_a`↔`idle_b` | `idle_b` · `eat_down` | 20s / 8s | 10% |
| **onShift** | `idle_a`↔`idle_b` | `wash_sit` 85% · `scratch_l/r` 各 7.5% | 25s / 8s | 15% |
| **lunch** | `eat_down` | `sleep2_l` · `sleep2_r` | 15s / 20s | 100% |
| **dinner** | `eat_down` | `idle_b` · `wash_sit` | 15s / 12s | 100% |
| **nightShift** | `idle_a`↔`idle_b` | `wash_sit`；另每 45s 插播 `yawn_sit` | 30s / 8s | 100% |
| **overtime L1** | `yawn_sit` ↔ `yawn_stand` | — | 每 8s 交替 | — |
| **overtime L2** | `meow_stand` | `yawn_sit` | 12s / 12s | 100% |
| **overtime L3** | `hiss_l` ↔ `paw_attack_down` | — | 每 3s 交替 | — |
| **overtime L4** | `sad_sit_down` | 偶尔 `paw_attack_down`（15% / 10s） | — | — |
| **done** | `sleep1_l` ↔ `sleep4_l` | `sleep2_l` | 30s / 30s | 100% |

未轮换时：`beforeWork` / `onShift` / `nightShift` 仅在 `idle_a` / `idle_b` 间切换，不播其他主 clip。

### 6.1.1 活动区漫游（`ROAM_SCENES`）

漫游时播放 8 向 `walk_*`（按移动方向选 clip）。**加班不漫游**。

| scene | 触发间隔 | 概率 |
|-------|----------|------|
| beforeWork | 5–12s | 总是 |
| lunch / dinner | 14–24s | 45% |
| onShift | 22–38s | 30% |
| nightShift | 28–42s | 20% |
| done | 16–28s | 总是 |
| overtime | — | 不漫游 |

### 6.2 用户点击 `onTap`（overlay 2–3s，冷却 8s）

| 当前 scene | 反应池 |
|------------|--------|
| beforeWork / onShift / nightShift | `meow_stand` 70% · `paw_attack_down` 20% · `scratch_l/r` 各 5% |
| lunch / dinner | `meow_sit` 50% · `eat_down` 1 cycle 50% |
| overtime L1–L2 | `meow_stand` 50% · `yawn_sit` 50% |
| overtime L3+ | `paw_attack_down` 70% · `hiss_l` 单帧 30% |
| done | `sleep1_l` 50% · `sleep4_l` 50% |

### 6.2.1 ~~喵提醒~~（已废弃）

原「午休 + working → 60s 喵」已移除。午休提醒见 **§12.5 C 层**（纯视觉、不绑打卡、每 session 一次）。

### 6.3 Clip 命名与资产（当前 43 个）

命名规则：`{action}_{pose}` 或 `{action}_{direction}`，无 `_down` 后缀（down 为默认朝向）。

| 分组 | clip keys |
|------|-----------|
| IDLE×2 | `idle_a`, `idle_b` |
| WALK×8 | `walk_down/up/left/right`, `walk_*_down/up`（斜向） |
| SLEEP×8 | `sleep1_l/r` … `sleep4_l/r` |
| EAT | `eat_down` |
| MEOW×4 | `meow_sit`, `meow_stand`, `meow_sit2`, `meow_lie` |
| YAWN×4 | `yawn_sit`, `yawn_stand`, `yawn_sit2`, `yawn_lie` |
| WASH×3 | `wash_sit`, `wash_stand`, `wash_lie` |
| SCRATCH×2 | `scratch_l`, `scratch_r`（原 ITCH） |
| HISS×2 | `hiss_l`, `hiss_r` |
| PAW×8 | `paw_attack_down/up/left/right` + 4 斜向 |
| SAD | `sad_sit_down` |

帧索引见 `cat-pet/Frame indexes.png`；素材从 `cat 16x16 with text.png` 导出至 `miniprogram/assets/cat-pet/`。

### 6.4 开发调试

- 仅 `develop` 环境：长按活动区打开调试面板
- 可切换 11 种 scene 预设（含加班 L1–L4、午休打卡/未打卡）
- 按分组预览全部 clip；`forceClip` 覆盖场景 FSM

---

## 7. 架构

```
miniprogram/
├── core/
│   ├── work-schedule.js    # 段校验、computeDailyWorkHours、resolveSegment(now)
│   └── pet-context.js      # resolvePetContext(appState, now, settings)
├── components/
│   └── cat-pet/
│       ├── index.js        # canvas 2d 帧动画 + 漫游 + onTap + scene FSM
│       ├── index.wxml
│       ├── index.wxss
│       └── index.json
├── pages/
│   ├── home/index.*        # <cat-pet scene="{{petContext}}" escalation="{{...}}" />
│   └── settings/index.*    # 分段 time-picker UI + 夜班开关
└── assets/cat-pet/         # 切图后的 PNG 序列或 atlas JSON
```

### 7.1 Home 集成

- `onShow` / timer tick（与金额刷新同频或 1s）调用 `resolvePetContext`
- 猫组件 props：`scene`, `escalation`, `appState`（`scene` 取值即 §5 的 PetContext）
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

首版可不改 onboarding 第一步；首启仍用默认 schedule。  
或 onboarding 增加一步「你的作息」（与 settings 同表单）——**实现时二选一，默认仅 settings 可配**。

---

## 8. 与现有系统衔接

| 模块 | 变更 |
|------|------|
| `dilution.js` / `clock.js` | 无逻辑改；仍读 `standardHoursPerDay` |
| `saveSettings` | 保存 schedule 时 `computeDailyWorkHours` 写回 |
| 云同步 | schedule 字段随 settings 加密同步 |
| Phase 8 Launch | **依赖本 phase 完成** |

---

## 9. 测试要点

| # | 场景 |
|---|------|
| T1 | 默认 schedule 推导 8h，稀释与改前一致 |
| T2 | 开夜班 19–22 → 11h，时薪下降 |
| T3 | working @ 12:30 → lunch / `eat_down` |
| T4 | working @ 19:00 夜班段 → nightShift / `idle_a` + 漫游 |
| T5 | working @ 19:00 无夜班 → overtime L2 / `meow_stand` |
| T6 | working @ 23:30 → overtime L3 / `hiss_l` |
| T7 | tap 冷却 8s |
| T8 | done → `sleep1_l` / `sleep4_l` |
| T9 | 老用户迁移 schedule 无报错 |
| T10 | 午休段内 C 层 yawn 提醒仅触发 1 次/session，且不依赖打卡 |
| T11 | 首次生成 `petHabitProfile` 后跨日 `dayMood` 变化、永久字段不变 |
| T12 | 摸头/连点冷却与 overlay 互斥，不 spam 音效 |

---

## 12. Companion 陪伴层（A+B+C + 猫习惯）

> 状态：brainstorm 已定稿 | 2026-06-22  
> 范围：在 §6 动画 FSM 之上增加陪伴层；**不**改 scene 判定、**不**做养成经济/上云/用户可控猫格。

### 12.1 目标与非目标

**目标**

- **A 情绪共鸣**：11 态下猫的主态与用户心理同频（陪等、陪岗、放松、困、急、治愈）。
- **B 行为互动**：tap / 摸头 / 连点可发现，猫用 clip 回应（非教程式引导）。
- **C 情境提醒**：纯视觉主动 beat；音效仅提醒时刻 + 点猫偶发（素材后接）。
- **猫习惯**：永久猫格 + 每日心情，自动运行，用户不可配置。

**非目标**

- 文案气泡、弹窗、震动强提醒  
- 各 scene 常驻环境音  
- 午休打卡叙事；`lunch` 仅按时段判定  
- 设置页猫格开关 / 重 roll  
- **LLM / 微信 AI 生态 / 云开发 AI 对话**（猫行为 purely 本地 FSM + habit + 互动）

### 12.2 三层架构

```
┌─────────────────────────────────────────┐
│  C · 提醒（纯视觉 → 后接音效）  低频 cap │
├─────────────────────────────────────────┤
│  B · 互动（tap / 摸头 / 连点）  用户驱动 │
├─────────────────────────────────────────┤
│  A · 基态（§6 FSM + 猫习惯 bias）        │
└─────────────────────────────────────────┘
```

实现建议：扩展 `cat-pet/index.js` 为 `COMPANION_*` 配置表 + `petHabitProfile`（localStorage），**不**新增第四套 FSM。

### 12.3 猫格 `petHabitProfile`（D：永久 + 日 seed，无用户控制）

**首次渲染猫组件**时若无 profile 则自动生成：

| 字段 | 持久性 | 作用 |
|------|--------|------|
| `affinity` | 永久 | 漫游回中心频率、idle 周期 bias |
| `napCorner` | 永久 | 收工/午休 sleep 时 roaming 终点偏好（左/中/右） |
| `groomer` | 永久 | `wash_sit` 轮换权重 +0~+20% |
| `touchiness` | 永久 | 摸头 → 闭眼 / wash / scratch / 短 hiss 概率 |
| `dayMood` | 每日 seed | 当日 `eat` / `sleep2` / `scratch` 权重微调（greedy / sleepy / playful） |

`dayMood` 每日 0 点或当日首次打开重 roll；其余字段长期稳定。

**习惯 beat（A 层，猫自发）**

- 上班前 + 高 `groomer`：进 scene 60–120s 内一次 `wash_sit`（若未在 overlay/漫游）
- 午休 + `dayMood=greedy`：`eat_down` 轮换权重 +15%
- 收工 + `napCorner`：漫游 home 偏向活动区一角

习惯 **不** 占用 C 层 session 提醒配额。

### 12.4 B 层：分区互动

64×64 hit 区（用户无 UI 示意）：

| 区域 | 占比 | 触发 | 行为 |
|------|------|------|------|
| 头 | ~30% | 长按 ≥0.4s | 摸头：见 `touchiness` 表 |
| 身 | ~50% | 单击 | 现有 `TAP_POOLS` overlay |
| 尾/脚 | ~20% | 3 连点 / 1.2s | scene playful clip（如 `paw_attack_down` 半轮） |

**摸头 × touchiness**

| touchiness | 结果 |
|------------|------|
| 低 | `idle_b` 延长 ~3s |
| 中 | 50% `wash_sit` / 50% 延长 idle |
| 高 | 30% `scratch_l`、10% 短 `hiss_l` overlay 1s（不升级加班 escalation） |

**冷却**

| 互动 | 冷却 |
|------|------|
| 普通 tap | 8s（现有） |
| 摸头 | 12s |
| 连点 | 6s |

overlay 播放中忽略新输入；冷却互不重置，共享 busy 态。

### 12.5 C 层：视觉提醒（每 session 每 scene 最多 1 次）

| scene | 触发条件 | 视觉 | 音效挂载点 |
|-------|----------|------|------------|
| beforeWork | 距 `morning.start` ≤15min 且尚未提醒 | `yawn_sit` 一轮 | `sfx.nudge.yawn` |
| onShift | — | 无 | — |
| lunch | 进入 lunch 段 ≥5min | `yawn_sit` 或 `eat_down` 半轮（`dayMood` 定） | `sfx.nudge.yawn` / `sfx.eat` |
| dinner | — | 无 | — |
| nightShift | 已有 45s `yawn_sit`（§6） | 沿用 | `sfx.nudge.yawn` |
| overtime L1 | 进入 L1 首次 | 当前 yawn 交替即可 | 可选轻哈欠 |
| overtime L2 | 升入 L2 首次 | 一次 `meow_stand` overlay | `sfx.meow` |
| overtime L3+ | 动画已表达 | 无额外 C | hiss/paw 现有 clip |
| done | 进入 done 首次 | `sleep1_l` 微动 1 轮 | `sfx.sleep` |

**删除**：原「午休 + working → 60s 喵提醒」逻辑（午休不需要打卡，不与 appState 绑定）。

**点猫偶发音**：普通 tap 30%、摸头 40%、连点 20%；respect 冷却；设置页可仅「猫音效」总开关（非猫格控制）。

### 12.6 11 态陪伴定位一览

| # | 预设（调试可合并） | A 情绪 | B 要点 | C |
|---|-------------------|--------|--------|---|
| 1 | 上班前 | 期待、闲 | 漫游多、连点 playful | 临上班 yawn |
| 2 | 上班中 |  quiet 陪岗 | 摸头闭眼 | 无 |
| 3 | 午休 | 吃、困 | 连点→eat 1 轮 | 段中 yawn/eat |
| 4 | 晚休 | 放松 | wash 权重↑（habit） | 无 |
| 5 | 晚班 | 困但陪 | 摸头 wash | 45s yawn |
| 6–9 | 加班 L1–L4 | 困→叫→急→丧 | L3+ 摸头易 hiss | L2 meow |
| 10 | 已收工 | 治愈 | 摸头 sleep 延长 | 进入 done chime |

调试面板「午休·打卡 / 未打卡」合并为 **「午休」** 单预设；`appState` 仅影响金额/按钮，**不**分叉猫 C 层。

### 12.7 Companion Decision Log

| # | 决策 | 备选 | 理由 |
|---|------|------|------|
| C1 | 三层配置扩展 FSM | 独立剧本 FSM | 可维护 |
| C2 | C 纯视觉 + 后接音效 | 文案气泡 | 用户选择 |
| C3 | 习惯 D（永久+日seed）无 UI | 用户选猫格 | 用户选择 |
| C4 | 午休不绑打卡 | 双轨 lunch | 用户选择 |
| C5 | 音效：提醒+点猫偶发 | 环境音 | 用户选择 |
| C6 | hit 三分区 + 三冷却 | 仅 tap | 可发现互动 |
| C7 | 移除 60s 午休 meow reminder | 保留 | 与 C4 一致 |
| C8 | 不接入 AI/LLM | 云开发 AI / 微信 AI Agent | 用户明确；Launch 走 §12 本地方案 |

### 12.8 实现顺序建议

1. `petHabitProfile` 生成与持久化  
2. B 层 hit 分区 + 摸头/连点  
3. 习惯 bias 接入轮换/漫游  
4. C 层提醒表 + session cap  
5. 音效 API 占位 `playCompanionSfx(id)`（素材后填）  
6. 调试面板合并午休预设 + habit 只读展示（develop）

> **演进**：§13「真猫弧线」为下一版行为目标；实现后取代 §12 中「纯权重轮换 + 三区点击」部分。§12 已落地的 habit / sfx / C 层 cap 可复用。

---

## 13. 真猫弧线 Companion v2（brainstorm 定稿）

> **Launch 说明（2026-06-23）**：Launch 行为已由 [PET-MICRO-BEHAVIOR.md](./PET-MICRO-BEHAVIOR.md) 驱动；`pet-micro.js` + `useMicroFsm` **superseded** 本节弧 runner 主循环。本节保留作历史参考，弧相关 API 仅作 legacy 回退。

> 状态：已定稿 | 2026-06-22  
> 模型：**C 混合** — Scene 门控允许弧线；猫格 + dayMood 偏概率；session 内弧进度，换 scene 重置。

### 13.1 目标摘要

- 陪伴感来自 **可读的 clip 步骤序列**（walk → yawn → sleep），非随机闪回 idle。
- **睡中被点** 走专用 interrupt（yawn / meow / hiss），模拟真猫。
- 约束同 §12：本地 FSM、无 AI、无用户调猫格 UI、纯视觉 + 音效挂载。
- 非目标：能量条 UI、跨 session 云同步、文案气泡。

### 13.2 睡眠分级（锁定）

| 级别 | clip | 含义 |
|------|------|------|
| **浅睡** | `sleep1_*` · `sleep2_*` | 打盹、易醒 |
| **深睡** | `sleep3_*` · `sleep4_*` | 睡沉；**sleep4 = 最放松、最深** |

### 13.3 弧线（Arc）目录

每条弧 = **有序步骤** `{ kind, clip(s), cycles?, roam? }`。

| 弧 ID | 步骤 | 语义 |
|-------|------|------|
| **explore** | walk×1–3 → idle → (可选 yawn) | 闲着逛 |
| **nap** | walk×0–1 → yawn → sleep1/2 → (可选 sleep3) | 饭后/午后浅盹 |
| **homeLife** | walk×2–4 → idle → wash / scratch | 收工傍晚居家逛 |
| **settle** | yawn → sleep3 → sleep4（定住） | 深夜收工大睡 |
| **accompany** | idle 眨眼 ↔ wash ↔ scratch | 陪岗 |
| **drowse** | idle → yawn → idle | 困但陪着 |
| **feast** | eat → yawn → sleep1/2 | 午休吃饭犯困 |
| **stress** | hiss ↔ paw（L3+） | 加班急（沿用 §6） |

### 13.4 Scene 允许弧线（硬边界）

| Scene | 允许 | 禁止 |
|-------|------|------|
| beforeWork / offDuty* | explore, nap, feast | settle 深睡 |
| onShift | accompany, drowse | 自动 walk 弧、sleep3/4 |
| lunch | feast, nap | 长 explore |
| dinner | feast, accompany | nap 加深到 sleep3+ |
| nightShift | drowse, accompany | explore |
| overtime L1–2 | otYawn / otMeow | nap, settle |
| overtime L3 | stress（3s hiss↔paw） | 生活弧 |
| overtime L4 | meltdown（sad + 偶发 paw） | 生活弧 |
| done（18–22 点） | homeLife / explore / nap | settle 深睡 |
| done（22–6 点） | settle / nap | 长 explore |

\* **offDuty**（建议新增）：idle 且不在工作/午休段（含周末、下班后）→ explore 为主；与「真·上班前 beforeWork」拆分。

### 13.5 猫格 / mood 偏弧（软权重）

| 字段 | 影响 |
|------|------|
| affinity 高 | explore 更常 walk 后回中心 |
| groomer 高 | accompany 中 wash 步更长 |
| touchiness 高 | 睡中 interrupt 的 hiss/scratch↑ |
| dayMood sleepy | nap / settle 权重↑ |
| dayMood playful | explore、paw 打断↑ |
| dayMood greedy | feast 步延长 |

Scene 切换：**弧 ID + stepIdx 清零**，在新白名单内重抽弧；猫格不变。

### 13.6 睡中被点 · Interrupt 表

| 睡眠级 | clip | 基础权重 |
|--------|------|----------|
| 浅睡 | sleep1 / sleep2 | yawn 65% · meow 22% · scratch 8% · hiss 5%† |
| 深睡 | sleep3 | yawn 50% · wash 22% · meow 15% · hiss 10%† · 续睡 sleep3 3% |
| 最深 | sleep4 | yawn 35% · yawn_lie 15% · wash 15% · meow 10% · hiss 20%† · 续睡 sleep4 5% |

† touchiness：low +0 · mid hiss +5% · high hiss +12%（sleep4 hiss 上限约 35%）。

**打断后节拍**：interrupt 1 轮 → **yawn 1 轮** → 按 scene 回 sleep 或 drowse idle。sleep4 打断后 50% 回 sleep4，50% 降到 sleep3。

### 13.7 非睡点击 & 优先级

- **单击统一入口**（弱化头/身/尾三区）：accompany/drowse → tap 池；walk 步 → meow/paw 并暂停一步；eat 步 → meow 或再吃 1 轮。
- **可选 P1**：双击 → `wash_sit` 半轮（8s 冷却，全 scene）。
- **优先级**：forceClip > interrupt（点击）> 弧 step 播放 > C 层提醒（仅 idle/eat 边界，**不**在深睡 step 中段插入）。

### 13.8 实现结构（§3）

```
pet-context.js          → scene（+ 建议 offDuty）
pet-habit.js            → profile（已有）
pet-arcs.js             → ARC_DEFS、SCENE_ALLOW、pickArc(scene, habit)
pet-interrupt.js        → sleepTier(clip)、pickSleepInterrupt、pickAwakeTap
cat-pet/index.js        → 弧 runner 取代 CONTEXT_CLIP_MAP 主轮换
                          _arcId, _stepIdx, _stepCycle
                          tick: 步完成 → next step；walk 步复用 roam 引擎
companion-sfx.js        → 已有占位
```

**弧 runner 伪码**

```js
// 步 kinds: clip | walk | idleBlink | roamWalk
onStepComplete() {
  if (interruptActive) return;
  advanceStep(); // 或 loop 本步 cycles
  if (arcComplete) pickArc(scene, habit); // 新弧
}
onCatTap() {
  if (isSleepClip(current)) playSleepInterrupt();
  else playAwakeTap();
  schedulePostInterrupt(); // yawn → resume arc or drowse
}
```

**迁移策略**：保留 `CONTEXT_CLIP_MAP` 作 fallback；develop 开关 `useArcFsm: true` 对照验收后默认开启。

### 13.9 实现顺序

1. `pet-arcs.js` + sleep 分级工具 + interrupt 表（纯函数 + 测试）  
2. 弧 runner 接入 `cat-pet`（单弧 nap/settle 先通）  
3. Scene 白名单 + offDuty 判定（`pet-context.js`）  
4. 睡中 interrupt + 打断后 yawn 节拍  
5. 关闭 onShift/done 自动 roam；explore/settle 弧内才 walk  
6. 简化单击；可选双击  
7. 调试面板：显示当前弧 / step / sleep 级  

### 13.10 测试要点

| # | 场景 |
|---|------|
| T-A1 | done → settle 弧 yawn→sleep3→sleep4 定住，无自动 roam |
| T-A2 | sleep4 被点 → yawn 节拍 → 50% 回 sleep4 |
| T-A3 | onShift 仅 accompany/drowse，不进 sleep3+ |
| T-A4 | nap 弧 walk→yawn→sleep1 可见完整序列 |
| T-A5 | touchiness high + sleep4 → hiss 概率升高 |
| T-A6 | scene 切换 → 弧重置，猫格不变 |
| T-A7 | C 提醒不在 sleep4 step 中段触发 |

### 13.11 Decision Log（弧线版）

| # | 决策 | 理由 |
|---|------|------|
| D-A0 | 浅睡 1/2、深睡 3/4，4 最深 | 用户锁定 |
| D-A1 | 步骤序列弧替代纯权重轮换 | 真猫 walk→yawn→sleep |
| D-A2 | C 混合：Scene 白名单 + habit 偏弧 | 用户选择 |
| D-A3 | onShift 禁 auto-walk / 深睡 | 陪岗语义 |
| D-A4 | 睡中专用 interrupt + 固定 yawn 后节拍 | 弄醒感 |
| D-A5 | 单击统一，弱化三区 | 可发现性 |
| D-A7 | sleep4_l/r 帧索引对调（manifest） | 素材朝向与命名不一致 |

> **实现状态（2026-06-22）**：§13 弧 runner 已默认开启（`useArcFsm: true`）；`offDuty` scene 已接入；双击洗脸 8s 冷却；晚班 45s 周期哈欠保留。

### 13.12 Walk 频率（弧内 + 闲时）

| 场景 | 弧内 walk | 闲时漫游间隔 |
|------|-----------|--------------|
| beforeWork / offDuty | explore/homeLife 多段穿插 | 5–9s / 6–11s |
| done-active（18–22 点） | homeLife 3–5 段/弧 | **5.5–10s** |
| lunch / dinner | nap/explore 少量 | 14–22s / 10–18s |
| onShift / done-night | 无 auto walk | — |
| 弧内单段 | homeLife 2–3 步连续 walk，再 idle/wash | — |

---

| 包 | 估时 |
|----|------|
| work-schedule + settings UI | 2–3 天 |
| sprite 切图 + cat-pet 组件 | 2–3 天 |
| pet-context FSM + home 集成 | 1–2 天 |
| 测试 + UAT | 1 天 |
| **合计** | **约 6–9 天** |

---

## 11. Roadmap 占位

- **Phase 7: Pet Companion** — workSchedule + cat-pet FSM（Launch 前）  
- **Phase 8: Launch** — 提审上线（依赖 Phase 7）  
- 需求 ID：`COMP-01`（陪伴猫）、`SET-04`（分段作息）

---

*Design locked: 2026-06-23 · §6 动画 · §12 Companion · §13 真猫弧线: 2026-06-22*
