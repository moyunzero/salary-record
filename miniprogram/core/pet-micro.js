const { sceneArcKey, sleepSide } = require('./pet-arcs');

const EXCITED_TAP_WINDOW_MS = 30000;
const EXCITED_TAP_COUNT = 3;
const EXCITED_PATROL_MS = 60000;
const EXCITED_COOLDOWN_MS = 45000;

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

function sceneMicroKey(scene, escalation, now) {
  return sceneArcKey(scene, escalation, now);
}

function createMicroSession() {
  return {
    tapTimes: [],
    excitedPatrolUntil: 0,
    excitedCooldownUntil: 0,
    positionMemory: {
      lastIdleTx: null,
      lastIdleTy: null,
      visitCount: { windowsill: 0, catBed: 0, centerRug: 0 },
      lastVisitAt: { windowsill: 0, catBed: 0, centerRug: 0 },
    },
    microChainRemaining: 0,
    microChainCategory: null,
    energyBurstUntil: 0,
    nextEnergyRollAt: 0,
  };
}

function recordTap() {
  return { triggeredPatrol: false };
}

function isExcitedPatrol() {
  return false;
}

function applyHardGateFilter(categories, sceneKey, inSleep4Hold) {
  if (inSleep4Hold && sceneKey === 'done-night') return ['hold'];
  return categories.filter((cat) => {
    if (sceneKey === 'onShift' && (cat === 'sleepDeep' || cat === 'hold')) return false;
    if ((sceneKey === 'overtime-L3' || sceneKey === 'overtime-L4')
      && (cat === 'sleepLight' || cat === 'sleepDeep' || cat === 'hold' || cat === 'eat')) {
      return false;
    }
    return true;
  });
}

function blockUsesForbiddenClip(block) {
  if (!block || !block.clip) return false;
  return block.clip.startsWith('sleep');
}

function blockUsesDeepSleep(block) {
  if (!block || !block.clip) return false;
  return block.clip.startsWith('sleep3_') || block.clip.startsWith('sleep4_');
}

function isWalkKind(kind) {
  return kind === 'walk' || kind === 'microWalk';
}

function pickNextMicroBehavior({ inSleep4Hold, habit, rng = Math.random }) {
  if (inSleep4Hold) {
    return { kind: 'hold', clip: `sleep4_${sleepSide(habit, rng)}` };
  }
  return { kind: 'clip', clip: 'idle_a' };
}

function resolveWalkTarget() {
  return { tx: 0.5, ty: 0.5 };
}

function onBlockComplete() {}

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
  blockUsesForbiddenClip,
  blockUsesDeepSleep,
  isWalkKind,
};
