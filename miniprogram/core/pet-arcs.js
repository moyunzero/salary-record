const ARC_IDS = [
  'explore',
  'homeLife',
  'nap',
  'settle',
  'accompany',
  'drowse',
  'feast',
  'stress',
];

function minutesFromDate(now) {
  if (typeof now === 'number') return now;
  const d = now instanceof Date ? now : new Date(now || Date.now());
  return d.getHours() * 60 + d.getMinutes();
}

/** 收工后按真实钟点分档：傍晚活跃、深夜才深睡 */
function resolveDoneBand(now) {
  const m = minutesFromDate(now);
  if (m >= 22 * 60 || m < 6 * 60) return 'done-night';
  return 'done-active';
}

const SCENE_ARC_ALLOW = {
  beforeWork: ['explore', 'nap', 'feast', 'homeLife'],
  offDuty: ['explore', 'homeLife', 'nap', 'feast'],
  onShift: ['accompany', 'drowse'],
  lunch: ['feast', 'nap'],
  dinner: ['feast', 'accompany', 'homeLife'],
  nightShift: ['drowse', 'accompany'],
  'overtime-L1': ['otYawn'],
  'overtime-L2': ['otMeow'],
  'overtime-L3': ['stress'],
  'overtime-L4': ['meltdown'],
  'done-active': ['homeLife', 'explore', 'nap', 'drowse', 'feast'],
  'done-night': ['settle', 'nap', 'drowse'],
};

const BASE_ARC_WEIGHTS = {
  explore: 1,
  nap: 1,
  settle: 1,
  accompany: 1,
  drowse: 1,
  feast: 1,
  stress: 1,
};

const SCENE_ARC_WEIGHT_BIAS = {
  beforeWork: { explore: 1.4, nap: 0.9, feast: 0.8 },
  offDuty: { explore: 1.4, homeLife: 1.5, nap: 1.0, feast: 0.9 },
  onShift: { accompany: 1.3, drowse: 1.0 },
  lunch: { feast: 1.5, nap: 1.0 },
  dinner: { feast: 1.2, accompany: 1.1, homeLife: 1.2 },
  nightShift: { drowse: 1.3, accompany: 1.0 },
  'done-active': { homeLife: 2.2, explore: 1.6, nap: 0.4, drowse: 0.45, feast: 0.7 },
  'done-night': { settle: 2.0, nap: 0.5, drowse: 0.4 },
};

const MOOD_ARC_BIAS = {
  sleepy: { nap: 1.4, settle: 1.3, drowse: 1.2 },
  playful: { explore: 1.4, stress: 1.1 },
  greedy: { feast: 1.5 },
};

function sceneArcKey(scene, escalation, now) {
  if (scene === 'overtime') {
    const level = Math.min(4, Math.max(1, escalation || 1));
    return `overtime-L${level}`;
  }
  if (scene === 'done') return resolveDoneBand(now);
  return scene || 'beforeWork';
}

function pickWeightedArc(pool, rng) {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i += 1) {
    r -= pool[i].weight;
    if (r <= 0) return pool[i].id;
  }
  return pool[pool.length - 1].id;
}

/** @deprecated Main loop replaced by pet-micro pickNextMicroBehavior (07-08). Kept for useArcFsm rollback. */
function pickArc(scene, habit, escalation, rng = Math.random, now = Date.now()) {
  const key = sceneArcKey(scene, escalation, now);
  const allowed = SCENE_ARC_ALLOW[key];
  if (!allowed || !allowed.length) return { arcId: 'drowse', stepIdx: 0 };

  const sceneBias = SCENE_ARC_WEIGHT_BIAS[key] || {};
  const moodBias = (habit && MOOD_ARC_BIAS[habit.dayMood]) || {};

  const pool = allowed.map((id) => {
    let w = BASE_ARC_WEIGHTS[id] || 1;
    if (sceneBias[id]) w *= sceneBias[id];
    if (moodBias[id]) w *= moodBias[id];
    return { id, weight: w };
  });

  return { arcId: pickWeightedArc(pool, rng), stepIdx: 0, stepCycle: 0 };
}

function sleepSide(habit, rng = Math.random) {
  const corner = (habit && habit.napCorner) || 'center';
  if (corner === 'left') return 'l';
  if (corner === 'right') return 'r';
  return rng() < 0.5 ? 'l' : 'r';
}

function lightSleepClip(habit, rng = Math.random) {
  const n = rng() < 0.5 ? 1 : 2;
  return `sleep${n}_${sleepSide(habit, rng)}`;
}

function deepSleepClip(habit, rng = Math.random) {
  return `sleep3_${sleepSide(habit, rng)}`;
}

function deepestSleepClip(habit, rng = Math.random) {
  return `sleep4_${sleepSide(habit, rng)}`;
}

function idleClip(alternate) {
  return alternate ? 'idle_b' : 'idle_a';
}

function randomInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** @deprecated Arc step definitions — main loop replaced by pet-micro (07-08). Kept for useArcFsm rollback. */
const ARC_DEFS = {
  explore: {
    steps: [
      { kind: 'walk', countMin: 2, countMax: 3 },
      { kind: 'clip', clip: 'idle_a', cycles: 1, alternateIdle: true },
      { kind: 'walk', countMin: 1, countMax: 2 },
      { kind: 'clip', clip: 'idle_b', cycles: 1 },
      { kind: 'walk', countMin: 1, countMax: 1, optional: 0.6 },
      { kind: 'clip', clip: 'yawn_sit', cycles: 1, optional: 0.35 },
    ],
  },
  homeLife: {
    steps: [
      { kind: 'walk', countMin: 2, countMax: 3 },
      { kind: 'clip', clip: 'idle_a', cycles: 1, alternateIdle: true },
      { kind: 'walk', countMin: 1, countMax: 2 },
      { kind: 'clip', clip: 'wash_sit', cycles: 1, groomerExtra: true, optional: 0.65 },
      { kind: 'walk', countMin: 1, countMax: 1, optional: 0.7 },
      { kind: 'clip', clip: 'scratch_l', cycles: 1, altClip: 'scratch_r', alternateStep: true, optional: 0.55 },
      { kind: 'walk', countMin: 1, countMax: 1 },
      { kind: 'clip', clip: 'idle_b', cycles: 1 },
    ],
  },
  nap: {
    steps: [
      { kind: 'walk', countMin: 0, countMax: 1 },
      { kind: 'clip', clip: 'yawn_sit', cycles: 1 },
      { kind: 'sleep', tier: 'light', cycles: 3 },
      { kind: 'sleep', tier: 'deep', cycles: 1, optional: 0.25 },
    ],
  },
  settle: {
    steps: [
      { kind: 'clip', clip: 'yawn_sit', cycles: 1 },
      { kind: 'sleep', tier: 'deep', cycles: 1 },
      { kind: 'sleep', tier: 'deepest', cycles: 1, terminal: true },
    ],
  },
  accompany: {
    steps: [
      { kind: 'clip', clip: 'idle_a', cycles: 2, alternateIdle: true },
      { kind: 'clip', clip: 'wash_sit', cycles: 1, groomerExtra: true },
      { kind: 'clip', clip: 'scratch_l', cycles: 1, altClip: 'scratch_r' },
    ],
  },
  drowse: {
    steps: [
      { kind: 'clip', clip: 'idle_a', cycles: 2, alternateIdle: true },
      { kind: 'clip', clip: 'yawn_sit', cycles: 1 },
      { kind: 'clip', clip: 'idle_b', cycles: 2 },
    ],
  },
  feast: {
    steps: [
      { kind: 'clip', clip: 'eat_down', cycles: 2, greedyExtra: true },
      { kind: 'clip', clip: 'yawn_sit', cycles: 1 },
      { kind: 'sleep', tier: 'light', cycles: 2 },
    ],
  },
  otYawn: {
    steps: [
      { kind: 'clip', clip: 'yawn_sit', cycles: 4 },
      { kind: 'clip', clip: 'yawn_stand', cycles: 4 },
    ],
  },
  otMeow: {
    steps: [
      { kind: 'clip', clip: 'meow_stand', cycles: 6 },
      { kind: 'clip', clip: 'yawn_sit', cycles: 4 },
    ],
  },
  stress: {
    steps: [
      { kind: 'clip', clip: 'hiss_l', cycles: 1, altClip: 'paw_attack_down', alternateStep: true, stepMs: 3000 },
    ],
  },
  meltdown: {
    steps: [
      { kind: 'clip', clip: 'sad_sit_down', cycles: 1, terminal: true },
    ],
  },
};

function resolveArcStep(arcId, stepIdx, ctx = {}) {
  const def = ARC_DEFS[arcId];
  if (!def || !def.steps.length) {
    return { kind: 'clip', clip: 'idle_a', cycles: 1, stepIdx: 0, arcComplete: true };
  }

  let idx = stepIdx;
  while (idx < def.steps.length) {
    const raw = def.steps[idx];
    if (raw.optional != null && ctx.rng() >= raw.optional) {
      idx += 1;
      continue;
    }
    if (raw.kind === 'walk') {
      const remaining = ctx.walkRemaining != null
        ? ctx.walkRemaining
        : randomInt(raw.countMin, raw.countMax, ctx.rng);
      if (remaining > 0) {
        return {
          kind: 'walk',
          walkRemaining: remaining,
          stepIdx: idx,
          arcComplete: false,
        };
      }
      idx += 1;
      continue;
    }

    const habit = ctx.habit;
    let clip = raw.clip;
    let cycles = raw.cycles || 1;

    if (raw.kind === 'sleep') {
      if (raw.tier === 'light') clip = lightSleepClip(habit, ctx.rng);
      else if (raw.tier === 'deep') {
        clip = deepSleepClip(habit, ctx.rng);
      } else if (raw.tier === 'deepest') {
        clip = deepestSleepClip(habit, ctx.rng);
      }
    } else if (raw.alternateIdle && ctx.idleAlt) {
      clip = idleClip(true);
    } else if (raw.altClip && raw.alternateStep && ctx.stressPhase) {
      clip = ctx.stressPhase % 2 === 0 ? raw.clip : raw.altClip;
    } else if (raw.altClip && raw.alternateStep && ctx.scratchPhase) {
      clip = ctx.scratchPhase % 2 === 0 ? raw.clip : raw.altClip;
    } else if (raw.groomerExtra && habit && habit.groomer === 'high') {
      cycles += 1;
    } else if (raw.greedyExtra && habit && habit.dayMood === 'greedy') {
      cycles += 1;
    }

    return {
      kind: 'clip',
      clip,
      cycles,
      stepIdx: idx,
      arcComplete: false,
      sleepTier: raw.kind === 'sleep' ? raw.tier : null,
      terminal: !!raw.terminal,
      stepMs: raw.stepMs || 0,
    };
  }

  return { kind: 'clip', clip: 'idle_a', cycles: 1, stepIdx: def.steps.length, arcComplete: true };
}

function stepCycleMs(clip, cycles, clipMeta) {
  const def = clipMeta && clipMeta[clip];
  const frameCount = (def && def.frames && def.frames.length) || 2;
  const fps = (def && def.fps) || 3;
  const cycleMs = (frameCount / fps) * 1000;
  return Math.max(cycleMs, 2000) * (cycles || 1);
}

function allowsArcRoam(arcId, step) {
  if (!step || step.kind !== 'walk') return false;
  return arcId === 'explore' || arcId === 'nap' || arcId === 'homeLife';
}

function arcAllowsAutoRoam(arcId) {
  return arcId === 'explore' || arcId === 'homeLife';
}

function shouldHoldAfterTerminal(scene, arcId, now) {
  if (arcId === 'settle' && scene === 'done' && resolveDoneBand(now) === 'done-night') {
    return true;
  }
  if (arcId === 'meltdown') return true;
  return false;
}

/** 弧外闲时漫游：scene → [minMs, maxMs] 触发间隔 */
const AMBIENT_WALK_MS = {
  beforeWork: [5000, 9000],
  offDuty: [6000, 11000],
  'done-active': [5500, 10000],
  lunch: [14000, 22000],
  dinner: [10000, 18000],
};

function ambientWalkKey(scene, now) {
  if (scene === 'done') {
    return resolveDoneBand(now) === 'done-active' ? 'done-active' : null;
  }
  if (scene === 'beforeWork' || scene === 'offDuty' || scene === 'lunch' || scene === 'dinner') {
    return scene;
  }
  return null;
}

function nextAmbientWalkDelay(key, rng = Math.random) {
  const iv = AMBIENT_WALK_MS[key];
  if (!iv) return 0;
  return iv[0] + rng() * (iv[1] - iv[0]);
}

module.exports = {
  ARC_IDS,
  SCENE_ARC_ALLOW,
  ARC_DEFS,
  minutesFromDate,
  resolveDoneBand,
  sceneArcKey,
  pickArc,
  resolveArcStep,
  stepCycleMs,
  allowsArcRoam,
  arcAllowsAutoRoam,
  shouldHoldAfterTerminal,
  ambientWalkKey,
  nextAmbientWalkDelay,
  AMBIENT_WALK_MS,
  lightSleepClip,
  deepSleepClip,
  deepestSleepClip,
  sleepSide,
};
