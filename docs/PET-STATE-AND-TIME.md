# 薪时宝 · 猫状态与时间逻辑总览

> 状态：与代码同步 | 2026-06-23  
> 实现：`pet-context.js` → `pet-micro.js` → `cat-pet/index.js`  
> 设计详案见 [PET-SCHEDULE-DESIGN.md](./PET-SCHEDULE-DESIGN.md) · Launch 微行为见 [PET-MICRO-BEHAVIOR.md](./PET-MICRO-BEHAVIOR.md)

---

## 1. 三层结构

```
┌─────────────────────────────────────────────────────────┐
│  Layer 0 · 时间 & 用户状态                               │
│  wall clock + workSchedule + appState (idle/working/done) │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 1 · Scene（情境）          pet-context.js         │
│  beforeWork / onShift / lunch / … / overtime / done     │
│  overtime 附带 escalation L1–L4                          │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 2 · Micro Block（微行为）  pet-micro.js           │
│  pickNextMicroBehavior · 硬门禁 · 兴奋巡视 · 兴趣点       │
│  1–3 block 链：clip / walk / hold，无整条弧排程           │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 3 · 运行时              cat-pet/index.js          │
│  micro runner · walk 引擎 · 点击 interrupt · C 层提醒     │
│  猫格 habit 偏权重 · meow 音效（companion-sfx.js）        │
└─────────────────────────────────────────────────────────┘
```

**开关**：`useMicroFsm: true`（**Launch 默认**）。关闭且 `useArcFsm: true` 时回退弧 runner；两者皆关则旧版 `CONTEXT_CLIP_MAP` 权重轮换。

---

## 2. 时间输入

### 2.1 分段作息 `workSchedule`

来自用户设置，默认：

| 段 | 默认时间 | 说明 |
|----|----------|------|
| morning | 09:00–12:00 | 上午班 |
| lunch | 12:00–13:00 | 午休 |
| afternoon | 13:00–18:00 | 下午班 |
| eveningRest | 18:00–19:00 | 晚休（需开夜班） |
| nightWork | 19:00–22:00 | 晚班（需开夜班） |

`nightShiftEnabled === false` 时， eveningRest / nightWork **不参与**段判定。

### 2.2 用户 App 状态 `appState`

| 值 | 含义 | 来源 |
|----|------|------|
| `idle` | 未打卡 / 未在计薪 | 首页默认 |
| `working` | 正在计薪 | 用户点「开始上班」 |
| `done` | 今日已收工 | 用户点「收工」 |

**重要**：猫的 C 层提醒**不绑定**打卡状态（午休不需要用户打卡才触发 cat 行为）。

### 2.3 墙钟 `now`

- 情境判定：当前时刻落在哪个 schedule 段
- 收工 `done` 的二次分档：`resolveDoneBand(now)`（见 §4.2）
- C 层提醒：距上班/午休开始的时间差

---

## 3. Scene 判定（Layer 1）

**入口**：`resolvePetContext(appState, now, settings, options?)`  
**输出**：`{ context, escalation }`

### 3.1 判定顺序

| 优先级 | 条件 | context | escalation |
|--------|------|---------|------------|
| 1 | `appState === 'done'` | **done** | 0 |
| 2 | `appState === 'working'` 且 `now` 不在任一段内 | **overtime** | L1–L4（§3.2） |
| 3 | `appState === 'working'` 且 `now` 在 lunch 段 | lunch | 0 |
| 4 | `appState === 'working'` 且 `now` 在 nightWork 段 | nightShift | 0 |
| 5 | `appState === 'working'` 且 `now` 在 morning/afternoon 段 | onShift | 0 |
| 6 | `appState === 'idle'` 且 `now` 在 lunch 段 | lunch | 0 |
| 7 | `nightShiftEnabled` 且 `appState === 'idle'` 且 eveningRest 段 | dinner | 0 |
| 8 | `appState === 'idle'` 且 `now < morning.start` | beforeWork | 0 |
| 9 | 其余 idle（含工作时段未打卡、下班后、周末等） | **offDuty** | 0 |

### 3.2 加班 Escalation

`lastEnd` = 当日最后一段**计划上班**结束时刻（无夜班 → `afternoon.end`；有夜班 → `nightWork.end`）。

| Level | 条件 |
|-------|------|
| **L1** | working + `now > lastEnd`，超出 ≤ 60min |
| **L2** | 超出 60–120min |
| **L3** | 超出 > 120min **或** 墙钟 ≥ 23:00 |
| **L4** | L3 持续 > 10min（需传 `options.l3EnteredAt`） |

弧线路由键：`overtime-L1` … `overtime-L4`。

### 3.3 Scene 一览

| context | 典型时刻 | 猫在干嘛（语义） |
|---------|----------|------------------|
| beforeWork | 上班前 | 期待、闲逛 |
| onShift | 上午/下午班内 + working | 陪岗、安静 |
| lunch | 午休段 | 吃饭、打盹 |
| dinner | 晚休段 + idle + 有夜班 | 放松、居家 |
| nightShift | 晚班段 + working | 困但陪着 |
| overtime | 计划外仍 working | 困→叫→急→丧 |
| offDuty | idle 且非 beforeWork | 自由居家（逛/睡） |
| done | 用户已收工 | 按墙钟分 active/night（§4.2） |

---

## 4. 收工 Done 的双层逻辑

用户点「收工」→ `context = done`（**与用户墙钟无关，优先于 schedule**）。

### 4.1 与 offDuty 的区别

| | done | offDuty |
|---|------|---------|
| 触发 | `appState === 'done'` | `appState === 'idle'` |
| 语义 | 用户宣告今日收工 | 未打卡/未收工的空闲 |
| 动画 | 分 active / night 两档 | 始终偏 active（explore/homeLife） |

### 4.2 墙钟分档 `resolveDoneBand(now)`

| 分档 | 墙钟 | 弧允许 | 猫的行为 |
|------|------|--------|----------|
| **done-active** | 06:00–22:00 | homeLife, explore, nap, drowse, feast | 居家活跃：多段 walk、舔毛、浅盹 |
| **done-night** | 22:00–06:00 | settle, nap, drowse | 深睡：yawn → sleep3 → sleep4 定住 |

> 例：18 点收工 → 逛家；23 点收工 → 直接大睡。

---

## 5. Micro 行为调度（Layer 2）

**入口**：`pickNextMicroBehavior({ scene, escalation, habit, session, doneBand, … })`  
每个 block 完成后立即重抽；无 `arcId` / `stepIdx` 步进。详案：[PET-MICRO-BEHAVIOR.md](./PET-MICRO-BEHAVIOR.md)

### 5.1 Block 种类

| kind | 说明 |
|------|------|
| `clip` / `clipHalf` | 单 clip 或半周期 |
| `walk` / `microWalk` | 2–4 步或 1 步漫游 |
| `hold` | sleep4 等定住至 interrupt |

### 5.2 硬门禁

| 条件 | 禁止 | 允许 |
|------|------|------|
| `done-night` + sleep4 hold | 自发 block | 仅 interrupt 唤醒 |
| `overtime-L3/L4` | nap、settle、feast、sleep* | idle、walk、meow、hiss、paw |
| `onShift` | sleep3/4 深睡 | sleep1/2 浅睡低权重 |

### 5.3 兴奋巡视（全 scene）

- 30s 内 ≥3 次有效 tap → 60s 巡视态（walk ~60%、↑ meow/paw）
- 结束后 45s 冷却；触发时播 `meow_mid`
- scene 切换保留 wall-clock 计时

### 5.4 兴趣点（Launch）

`windowsill` · `catBed`（habit.napCorner）· `centerRug` — walk 目标偏置与到达后 clip 偏好见 PET-MICRO-BEHAVIOR §5。

### 5.5 Scene 基线权重

11 档 scene（含 done-active / done-night / overtime-L1–L4）各有 walk/idle/meow/sleep 等相对权重；`onShift` 基线 walk ~40%。habit.dayMood 与 scene 表相乘。

> **Legacy**：`pet-arcs.js` 的 `pickArc` / `ARC_DEFS` 仍保留供 `useArcFsm && !useMicroFsm` 回退；Launch 主路径不再步进弧。

---

## 6. Walk 漫游

Walk 由 **micro block** 触发（`walk` / `microWalk`），复用 8 向 `walk_*` clip 与现有步进引擎；**不在脚步上发声**。

### 6.1 Micro-initiated walk

- `pickNextMicroBehavior` 按 scene 权重抽 walk block（2–4 步或 1 步 microWalk）
- `onShift` 基线 walk ~40%；兴奋巡视 60s 内 ~60% walk
- 目标：`resolveWalkTarget` — 兴趣点偏置（40% 基线 / 70% 巡视）或 idle 位置记忆 ± 抖动

### 6.2 兴奋巡视 walk

30s 内 3 tap 触发后，walk 权重 ×1.5；优先兴趣点序列；walk block 结束时有 15% 概率 `meow_mid`（`companion-sfx.js`）。

### 6.3 漫游落点

`roamTargetRatios(scene, habit)` 与 habit.affinity / napCorner 仍约束随机 roam；micro 兴趣点坐标见 PET-MICRO-BEHAVIOR §5。

> **Legacy 弧模式**：`useArcFsm && !useMicroFsm` 时仍用弧内 walk + ambient walk 间隔表（`pet-arcs.js`）。

---

## 7. 睡眠分级

| 级别 | clip | 含义 |
|------|------|------|
| **浅睡** | sleep1_* · sleep2_* | 打盹、易醒 |
| **深睡** | sleep3_* | 睡沉 |
| **最深** | sleep4_* | 最放松（**sleep4_l/r 帧索引已对调**） |

朝向：`napCorner` left/right → `_l` / `_r`；center → 随机。

---

## 8. 点击与 Interrupt

**弧线模式**：单击统一入口（`onArcTap`）；双击 400ms 内 → `wash_sit`（8s 冷却）。

### 8.1 优先级

```
forceClip > interrupt（点击）> 弧 step > C 层提醒
```

C 提醒**不**在 sleep3/4 播放中段插入。

### 8.2 睡中点击 → interrupt 表

| 睡眠级 | 主要反应 |
|--------|----------|
| 浅睡 1/2 | yawn 65% · meow 22% · scratch 8% · hiss 5%† |
| 深睡 3 | yawn 50% · wash 22% · meow 15% · hiss 10%† · 续睡 3% |
| 最深 4 | yawn_lie 40% · meow_lie 20% · wash_lie 15% · hiss† · 续睡 5% |

† touchiness：mid +5% hiss，high +12% hiss（sleep4 hiss 上限 ~35%）。

### 8.3 打断后节拍

```
interrupt 播完 →（深睡且非 yawn 类则跳过）→ yawn 一轮 → postInterruptResume
```

| 场景 | 续态 |
|------|------|
| done-night | 回 sleep4 |
| done-active | 35% 浅睡 / 否则 idle → 继续 homeLife |
| 其他 | 50% sleep4 / sleep3 或 drowse idle |

普通点击冷却 **8s**。

---

## 9. C 层视觉提醒

每 session 每 scene **最多 1 次**（`evaluateCompanionNudge`）。

| scene | 触发 | 视觉 |
|-------|------|------|
| beforeWork | 距 `morning.start` ≤15min | yawn_sit |
| lunch | 进入 lunch ≥5min | yawn_sit 或 eat（greedy） |
| overtime L2 | 升入 L2 首次 | meow_stand |
| done | 仅 **非** arc 模式 | sleep1_l |
| nightShift | arc 模式下每 **45s** | yawn_sit（非深睡时） |

**已删除**：午休 60s meow 提醒（与「午休不需打卡」一致）。

---

## 10. 运行时状态机要点

| 状态变量 | 含义 |
|----------|------|
| `_microBlock` / `_microHold` | 当前 micro block 与 hold 定住 |
| `_microSession` | tap 窗口、兴奋巡视、兴趣点记忆 |
| `_arcWalkActive` | walk block 进行中（micro / arc 共用引擎） |
| `_inSleep4Hold` | done-night sleep4 定住 |
| `_interruptChain` | 睡中打断链 interrupt → yawn → resume |
| `_arcId` / `_arcStepIdx` | **legacy** 弧模式专用 |

Micro 模式：block 完成 → `pickNextMicroBehavior` 抽下一个。Legacy 弧模式：步骤完成 → `pickArc` 抽下一条弧。

---

## 11. 模块对照

| 文件 | 职责 |
|------|------|
| `core/work-schedule.js` | schedule 段判定、lastEnd |
| `core/pet-context.js` | appState × 时间 → scene + escalation |
| `core/pet-micro.js` | 微行为池、硬门禁、兴奋巡视、兴趣点 |
| `core/pet-arcs.js` | **legacy** 弧定义、done 分档、ambient walk |
| `core/pet-interrupt.js` | 睡眠级、interrupt 表、醒点 tap、续睡 |
| `core/pet-habit.js` | 猫格持久化、dayMood |
| `core/pet-companion.js` | C 提醒、groom beat、漫游落点 |
| `services/companion-sfx.js` | meow_soft/mid/loud 播放与设置开关 |
| `components/cat-pet/index.js` | micro runner、渲染、点击 |
| `pages/home/index.js` | `resolvePetContext` → 传给 cat-pet |

---

## 12. 调试预设（develop）

| 预设 | scene | appState | 说明 |
|------|-------|----------|------|
| 上班前 | beforeWork | idle | |
| 闲暇 | offDuty | idle | |
| 上班中 | onShift | working | |
| 午休 | lunch | idle | |
| 晚休 | dinner | idle | |
| 晚班 | nightShift | working | |
| 加班 L1–L4 | overtime | working | escalation 1–4 |
| 已收工 | done | done | 看 doneBand：傍晚活跃 / 深夜 |

调试面板显示：`microBlockKind` · `excitedPatrol` · `interestId` · `tapCount30s` · `doneBand`（micro 模式）；legacy 弧模式另显示 `arcId` · `step`。

---

## 13. 快速决策表（用户视角）

| 用户操作 | 时间 | 猫 |
|----------|------|-----|
| 未打卡，08:00 | beforeWork | 微行为闲逛、偶尔吃 |
| 未打卡，15:00 | offDuty | walk + idle 居家 |
| 打卡，10:00 | onShift | 陪岗 idle/wash（walk ~40%） |
| 打卡，12:30 | lunch | 吃饭、浅睡 |
| 打卡，19:00 无夜班 | overtime L2+ | 哈欠/喵/急 |
| 收工，19:00 | done-active | **逛、洗、抓**，非一直睡 |
| 收工，23:00 | done-night | yawn → sleep4 hold |
| 收工后点猫（傍晚） | done-active | interrupt → 继续 micro blocks |
| 收工后点猫（深夜） | done-night | 弄醒 → 回 sleep4 |
| 30s 内连点 3 次 | 任意 active scene | 兴奋巡视 60s |

---

*文档版本：2026-06-23 · 对照 `useMicroFsm: true` Launch 实现*
