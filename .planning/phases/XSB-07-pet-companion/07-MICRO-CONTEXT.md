# Phase 7 Wave 6: Pet Micro-Behavior — Context

**Gathered:** 2026-06-23  
**Status:** Ready for planning  
**Source:** Brainstorming + `docs/PET-MICRO-BEHAVIOR.md`（用户已确认 D-M1–D-M7）

---

## Phase Boundary

**Launch 前完成**（Phase 8 提审之前）：将现有弧驱动 FSM 替换为 **微行为池**，增加全 scene 兴奋巡视、兴趣点漫游、猫叫音效。

**Depends on:** Phase 7 Waves 0–5（arc FSM、pet-arcs、cat-pet 组件已落地）

**In scope**

- `core/pet-micro.js` — 行为池、硬门禁、兴奋巡视、兴趣点、位置记忆
- `components/cat-pet/index.js` — micro runner 替换 `pickArc` 主循环
- `services/companion-sfx.js` — 接 `miniprogram/assets/sound/` 三档 meow
- 三只猫 sprite 重跑 pipeline（`cat-pet/cat 1.png`, `cat 1.6.png`, `cat 1.9.png` + labeled ref）
- 单测 + 文档回写 `PET-STATE-AND-TIME.md`

**Out of scope**

- 新 sprite / 新 clip（D-M1：仅现有 43 clips）
- 环境音、呼噜、爪垫 SFX（D-M7）
- 跨 session 位置持久化（session memory only）
- 用户可见猫设置 UI
- Phase 2 energy 系统、`dayMood` 漂移

---

## Implementation Decisions

### 架构（D-M3）

- **D-M3:** 移除长弧 `pickArc` 主循环 → `pickNextMicroBehavior()` 每 1–3 block
- **D-M4:** 硬门禁 — `done-night` sleep4 hold；L3/L4 禁 nap/settle/feast
- 保留 `pet-interrupt.js`、`pet-arcs.js` sleep 工具函数；废弃 `ARC_DEFS` 步进主路径

### 行为（D-M2, D-M5）

- **D-M2:** onShift 允许 walk；基线 ~40%
- **D-M5:** **所有 scene** — 30s 内 ≥3 有效 tap → 60s 兴奋巡视，walk ~60%；冷却 45s

### 漫游（D-M6）

- **D-M6:** Launch 做兴趣点 — 窗台、猫窝（`habit.napCorner`）、地毯中央
- session 级 `positionMemory` + `visitCount` 反比偏置

### 音效（D-M7）

- **D-M7:** 仅猫叫 `meow_soft|mid|loud`；素材放 `miniprogram/assets/sound/`

### 素材

- **D-M8:** 源 PNG 在 `cat-pet/`（三只猫 + `cat 16x16 with text.png` 标注参考）
- 复用 `scripts/slice-cat-sprites.mjs` + `verify-cat-atlas.mjs`；manifest 43 clips 全量验证三 variant

### Claude's Discretion

- micro block 链 35% 概率实现细节
- scene 权重表 Monte Carlo 容差
- debug 面板字段命名

---

## Canonical References

- `docs/PET-MICRO-BEHAVIOR.md` — 完整 spec（权重表、API、实现顺序）
- `docs/PET-STATE-AND-TIME.md` — 状态/时间逻辑（需 § 行为调度回写）
- `docs/PET-SCHEDULE-DESIGN.md` — §13 弧系统（标记 superseded by micro）
- `miniprogram/core/pet-arcs.js` — 待 deprecate 主路径
- `miniprogram/components/cat-pet/index.js` — arc runner 替换点
- `scripts/cat-pet-clips.manifest.json` — 43 clips
- `cat-pet/cat 1.png`, `cat 1.6.png`, `cat 1.9.png`, `cat 16x16 with text.png`

---

## Success Criteria (Wave 6)

1. 猫不再「整条弧循环」感；active scene walk 占比明显提升
2. 30s/3 tap 全 scene 触发 60s 巡视（可 debug 验证）
3. walk 目标偏兴趣点；猫窝随 napCorner
4. meow 音效可播且受设置开关控制
5. 三 variant atlas verify 通过；`npm run test:core` 含 pet-micro 单测

---

*Phase: XSB-07-pet-companion Wave 6*
