const { sceneArcKey, resolveDoneBand, sleepSide } = require('./pet-arcs');

const EXCITED_TAP_WINDOW_MS = 30000;
const EXCITED_TAP_COUNT = 3;
const EXCITED_PATROL_MS = 60000;
const EXCITED_COOLDOWN_MS = 45000;

const CHAIN_PROB = 0.35;
const CHAIN_EXTRA_MIN = 1;
const CHAIN_EXTRA_MAX = 2;
const POSITION_MEMORY_WALK_PROB = 0.3;
const INTEREST_BASELINE_PROB = 0.4;
const INTEREST_EXCITED_PROB = 0.7;
const POSITION_JITTER = 0.08;

const SCENE_WEIGHTS = {
  beforeWork: { walk: 48, idle: 22, washYawn: 14, meow: 8, eat: 0, sleepLight: 5, sleepDeep: 0, pawScratch: 3, hissSad: 0 },
  offDuty: { walk: 52, idle: 20, washYawn: 12, meow: 10, eat: 0, sleepLight: 4, sleepDeep: 0, pawScratch: 2, hissSad: 0 },
  onShift: { walk: 40, idle: 28, washYawn: 12, meow: 10, eat: 0, sleepLight: 8, sleepDeep: 0, pawScratch: 2, hissSad: 0 },
  lunch: { walk: 25, idle: 15, washYawn: 10, meow: 5, eat: 30, sleepLight: 12, sleepDeep: 0, pawScratch: 3, hissSad: 0 },
  dinner: { walk: 38, idle: 18, washYawn: 12, meow: 12, eat: 15, sleepLight: 3, sleepDeep: 0, pawScratch: 2, hissSad: 0 },
  nightShift: { walk: 35, idle: 25, washYawn: 10, meow: 8, eat: 0, sleepLight: 18, sleepDeep: 0, pawScratch: 4, hissSad: 0 },
  'done-active': { walk: 50, idle: 18, washYawn: 14, meow: 8, eat: 5, sleepLight: 3, sleepDeep: 0, pawScratch: 2, hissSad: 0 },
  'done-night': { walk: 12, idle: 10, washYawn: 5, meow: 3, eat: 0, sleepLight: 15, sleepDeep: 0, hold: 1, pawScratch: 0, hissSad: 0 },
  'overtime-L1': { walk: 30, idle: 25, washYawn: 20, meow: 15, eat: 0, sleepLight: 8, sleepDeep: 0, pawScratch: 2, hissSad: 0 },
  'overtime-L2': { walk: 25, idle: 22, washYawn: 15, meow: 25, eat: 0, sleepLight: 8, sleepDeep: 0, pawScratch: 5, hissSad: 0 },
  'overtime-L3': { walk: 8, idle: 15, washYawn: 5, meow: 10, eat: 0, sleepLight: 0, sleepDeep: 0, pawScratch: 12, hissSad: 50 },
  'overtime-L4': { walk: 5, idle: 10, washYawn: 0, meow: 5, eat: 0, sleepLight: 0, sleepDeep: 0, pawScratch: 8, hissSad: 72 },
};

const MOOD_CATEGORY_BIAS = {
  sleepy: { sleepLight: 1.4, washYawn: 1.3, sleepDeep: 1.2 },
  playful: { walk: 1.4, meow: 1.2, pawScratch: 1.2 },
  greedy: { eat: 1.5 },
};

const INTEREST_POINTS = {
  windowsill: { tx: 0.82, ty: 0.22, scenes: ['beforeWork', 'offDuty', 'done-active', 'dinner'] },
  centerRug: { tx: 0.5, ty: 0.55, scenes: null },
  catBed: { ty: 0.72, scenes: ['done-active', 'done-night', 'lunch'] },
};

const NAP_CORNER_TX = { left: 0.18, center: 0.5, right: 0.82 };

const FORBIDDEN_CLIPS = {
  nap: true,
  settle: true,
  feast: true,
};

const SLEEP_DEEP_PREFIX = ['sleep3_', 'sleep4_'];
const SLEEP_ANY_PREFIX = ['sleep1_', 'sleep2_', 'sleep3_', 'sleep4_'];

const CATEGORY_CLIP_POOLS = {
  idle: ['idle_a', 'idle_b'],
  washYawn: ['wash_sit', 'wash_stand', 'yawn_sit', 'yawn_stand', 'yawn_sit2'],
  meow: ['meow_sit', 'meow_stand', 'meow_sit2', 'meow_lie'],
  eat: ['eat_down'],
  sleepLight: null,
  sleepDeep: null,
  pawScratch: ['scratch_l', 'scratch_r', 'paw_attack_down', 'paw_attack_up'],
  hissSad: ['hiss_l', 'hiss_r', 'sad_sit_down'],
};

function normalizeNow(now) {
  if (now instanceof Date) return now;
  if (typeof now === 'number' && now > 1e12) return new Date(now);
  return now;
}

function nowMs(now) {
  const n = normalizeNow(now);
  return n instanceof Date ? n.getTime() : n;
}

function sceneMicroKey(scene, escalation, now) {
  return sceneArcKey(scene, escalation, normalizeNow(now));
}

function createPositionMemory() {
  return {
    lastIdleTx: null,
    lastIdleTy: null,
    visitCount: { windowsill: 0, catBed: 0, centerRug: 0 },
    lastVisitAt: { windowsill: 0, catBed: 0, centerRug: 0 },
  };
}

function createMicroSession() {
  return {
    tapTimes: [],
    excitedPatrolUntil: 0,
    excitedCooldownUntil: 0,
    positionMemory: createPositionMemory(),
    microChainRemaining: 0,
    microChainCategory: null,
    energyBurstUntil: 0,
    nextEnergyRollAt: 0,
  };
}

function pruneTapTimes(session, now) {
  session.tapTimes = session.tapTimes.filter((t) => now - t <= EXCITED_TAP_WINDOW_MS);
}

function recordTap(session, now) {
  pruneTapTimes(session, now);

  if (now < session.excitedCooldownUntil) {
    session.tapTimes.push(now);
    return { triggeredPatrol: false };
  }

  session.tapTimes.push(now);
  if (session.tapTimes.length >= EXCITED_TAP_COUNT && now >= session.excitedPatrolUntil) {
    session.excitedPatrolUntil = now + EXCITED_PATROL_MS;
    session.tapTimes = [];
    return { triggeredPatrol: true };
  }
  return { triggeredPatrol: false };
}

function isExcitedPatrol(session, now) {
  const ms = nowMs(now);
  if (session.excitedPatrolUntil > 0 && ms >= session.excitedPatrolUntil) {
    if (session.excitedCooldownUntil < session.excitedPatrolUntil + EXCITED_COOLDOWN_MS) {
      session.excitedCooldownUntil = session.excitedPatrolUntil + EXCITED_COOLDOWN_MS;
    }
  }
  return ms < session.excitedPatrolUntil;
}

function isActiveSceneKey(key) {
  return key !== 'done-night' && !key.startsWith('overtime-L3') && !key.startsWith('overtime-L4');
}

function rollEnergyBurst(session, now, rng) {
  const ms = nowMs(now);
  if (ms < session.energyBurstUntil) return true;
  if (ms >= session.nextEnergyRollAt) {
    session.nextEnergyRollAt = ms + 30000 + rng() * 60000;
    session.energyBurstUntil = ms + 8000;
    return true;
  }
  return false;
}

function catBedTx(habit) {
  const corner = (habit && habit.napCorner) || 'center';
  return NAP_CORNER_TX[corner] || NAP_CORNER_TX.center;
}

function interestAllowed(id, sceneKey) {
  const point = INTEREST_POINTS[id];
  if (!point) return false;
  if (id === 'catBed') return point.scenes.includes(sceneKey);
  if (point.scenes === null) return true;
  return point.scenes.includes(sceneKey);
}

function allowedInterests(sceneKey) {
  return Object.keys(INTEREST_POINTS).filter((id) => interestAllowed(id, sceneKey));
}

function interestWeight(id, habit, visitCount) {
  const visits = (visitCount && visitCount[id]) || 0;
  let w = 1 / (1 + visits);
  if (id === 'catBed') {
    const affinity = habit && habit.affinity;
    if (affinity === 'high') w *= 1.3;
    else if (affinity === 'low') w *= 0.7;
  }
  return w;
}

function resolveWalkTarget({ scene, habit, session, excited, rng, now }) {
  const sceneKey = sceneMicroKey(scene, 0, now);
  const pm = session.positionMemory;

  if (pm.lastIdleTx != null && pm.lastIdleTy != null && rng() < POSITION_MEMORY_WALK_PROB) {
    const jitter = () => (rng() * 2 - 1) * POSITION_JITTER;
    return {
      tx: Math.max(0, Math.min(1, pm.lastIdleTx + jitter())),
      ty: Math.max(0, Math.min(1, pm.lastIdleTy + jitter())),
    };
  }

  const interestProb = excited ? INTEREST_EXCITED_PROB : INTEREST_BASELINE_PROB;
  const interests = allowedInterests(sceneKey);
  if (interests.length && rng() < interestProb) {
    const pool = interests.map((id) => ({
      id,
      weight: interestWeight(id, habit, pm.visitCount),
    }));
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = rng() * total;
    let picked = pool[0].id;
    for (let i = 0; i < pool.length; i += 1) {
      r -= pool[i].weight;
      if (r <= 0) {
        picked = pool[i].id;
        break;
      }
    }
    const point = INTEREST_POINTS[picked];
    const tx = picked === 'catBed' ? catBedTx(habit) : point.tx;
    return { tx, ty: point.ty, interestId: picked };
  }

  return {
    tx: 0.1 + rng() * 0.8,
    ty: 0.15 + rng() * 0.65,
  };
}

function pickFromPool(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function sleepLightClip(habit, rng) {
  const side = sleepSide(habit, rng);
  const tier = rng() < 0.5 ? 1 : 2;
  return `sleep${tier}_${side}`;
}

function sleepDeepClip(habit, rng) {
  return `sleep3_${sleepSide(habit, rng)}`;
}

function holdSleep4Clip(habit, rng) {
  return `sleep4_${sleepSide(habit, rng)}`;
}

function isWalkKind(kind) {
  return kind === 'walk' || kind === 'microWalk';
}

function clipFromCategory(category, habit, rng) {
  if (category === 'walk') {
    if (rng() < 0.75) {
      return { kind: 'walk', walkSteps: 2 + Math.floor(rng() * 3) };
    }
    return { kind: 'microWalk', walkSteps: 1 };
  }
  if (category === 'hold') {
    return { kind: 'hold', clip: holdSleep4Clip(habit, rng) };
  }
  if (category === 'sleepLight') {
    return { kind: 'clip', clip: sleepLightClip(habit, rng) };
  }
  if (category === 'sleepDeep') {
    return { kind: 'clip', clip: sleepDeepClip(habit, rng) };
  }
  const pool = CATEGORY_CLIP_POOLS[category];
  if (!pool || !pool.length) {
    return { kind: 'clip', clip: 'idle_a' };
  }
  return { kind: 'clip', clip: pickFromPool(pool, rng) };
}

function blockUsesForbiddenClip(block) {
  if (!block || !block.clip) return false;
  const clip = block.clip;
  if (FORBIDDEN_CLIPS[clip]) return true;
  return SLEEP_ANY_PREFIX.some((p) => clip.startsWith(p));
}

function blockUsesDeepSleep(block) {
  if (!block || !block.clip) return false;
  return SLEEP_DEEP_PREFIX.some((p) => block.clip.startsWith(p));
}

function applyHardGateFilter(categories, sceneKey, inSleep4Hold) {
  if (inSleep4Hold && sceneKey === 'done-night') {
    return ['hold'];
  }

  return categories.filter((cat) => {
    if (sceneKey === 'onShift' && (cat === 'sleepDeep' || cat === 'hold')) return false;
    if ((sceneKey === 'overtime-L3' || sceneKey === 'overtime-L4')
      && (cat === 'sleepLight' || cat === 'sleepDeep' || cat === 'hold' || cat === 'eat')) {
      return false;
    }
    return true;
  });
}

function buildWeightMap(sceneKey, habit, excited, session, now, rng) {
  const base = SCENE_WEIGHTS[sceneKey] || SCENE_WEIGHTS.beforeWork;
  const weights = { ...base };
  const mood = (habit && MOOD_CATEGORY_BIAS[habit.dayMood]) || {};

  Object.keys(weights).forEach((cat) => {
    if (mood[cat]) weights[cat] *= mood[cat];
  });

  if (excited) {
    weights.walk *= 1.5;
    weights.meow *= 1.4;
    weights.pawScratch *= 1.3;
    weights.sleepLight *= 0.3;
    weights.washYawn *= 0.4;
    weights.sleepDeep *= 0;
  }

  if (isActiveSceneKey(sceneKey) && rollEnergyBurst(session, now, rng)) {
    weights.walk *= 1.25;
    weights.pawScratch *= 1.25;
    weights.meow *= 1.25;
  }

  return weights;
}

function pickWeightedCategory(weightMap, allowedCats, rng) {
  const pool = allowedCats
    .map((cat) => ({ cat, weight: weightMap[cat] || 0 }))
    .filter((p) => p.weight > 0);
  if (!pool.length) return 'idle';
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i += 1) {
    r -= pool[i].weight;
    if (r <= 0) return pool[i].cat;
  }
  return pool[pool.length - 1].cat;
}

function pickNextMicroBehavior({
  scene,
  escalation,
  now,
  habit,
  session,
  rng = Math.random,
  doneBand,
  inSleep4Hold,
}) {
  const sceneKey = doneBand || sceneMicroKey(scene, escalation, now);
  const excited = isExcitedPatrol(session, now);

  if (inSleep4Hold && sceneKey === 'done-night') {
    return { kind: 'hold', clip: holdSleep4Clip(habit, rng) };
  }

  let category;
  if (session.microChainRemaining > 0 && session.microChainCategory) {
    category = session.microChainCategory;
    session.microChainRemaining -= 1;
  } else {
    session.microChainCategory = null;
    const weightMap = buildWeightMap(sceneKey, habit, excited, session, now, rng);
    const allCats = Object.keys(weightMap);
    const allowed = applyHardGateFilter(allCats, sceneKey, false);
    category = pickWeightedCategory(weightMap, allowed, rng);

    if (rng() < CHAIN_PROB) {
      session.microChainCategory = category;
      session.microChainRemaining = CHAIN_EXTRA_MIN
        + Math.floor(rng() * (CHAIN_EXTRA_MAX - CHAIN_EXTRA_MIN + 1));
    }
  }

  const block = clipFromCategory(category, habit, rng);
  if (isWalkKind(block.kind)) {
    block.target = resolveWalkTarget({ scene, habit, session, excited, rng, now });
  }
  return block;
}

function onBlockComplete(session, block, finalPosition) {
  const pm = session.positionMemory;
  if (finalPosition) {
    pm.lastIdleTx = finalPosition.tx;
    pm.lastIdleTy = finalPosition.ty;
  }
  if (block && block.target && block.target.interestId) {
    const id = block.target.interestId;
    pm.visitCount[id] = (pm.visitCount[id] || 0) + 1;
    pm.lastVisitAt[id] = Date.now();
  }
}

module.exports = {
  EXCITED_TAP_WINDOW_MS,
  EXCITED_TAP_COUNT,
  EXCITED_PATROL_MS,
  EXCITED_COOLDOWN_MS,
  SCENE_WEIGHTS,
  createMicroSession,
  recordTap,
  isExcitedPatrol,
  sceneMicroKey,
  pickNextMicroBehavior,
  resolveWalkTarget,
  onBlockComplete,
  applyHardGateFilter,
  buildWeightMap,
  blockUsesForbiddenClip,
  blockUsesDeepSleep,
  isWalkKind,
};
