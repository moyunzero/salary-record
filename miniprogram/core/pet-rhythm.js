const { sleepSide } = require('./pet-arcs');
const {
  sceneMicroKey,
  isExcitedPatrol,
  resolveWalkTarget,
  isWalkKind,
} = require('./pet-micro');

const SEGMENT = {
  ROAM: 'ROAM',
  REST: 'REST',
  GROOM: 'GROOM',
  EAT: 'EAT',
  STRESS_COOLDOWN: 'STRESS_COOLDOWN',
};

const REST_MIN_MS = 300000;
const REST_MIN_MS_DEBUG = 15000;
const GROOM_BLOCK_MIN = 2;
const GROOM_BLOCK_MAX = 3;
const STRESS_COOLDOWN_MIN_MS = 20000;
const STRESS_COOLDOWN_MAX_MS = 40000;
const EAT_MIN_MS = 30000;
const EAT_MAX_MS = 90000;
const ROAM_WALK_STEPS_MIN = 2;
const ROAM_WALK_STEPS_MAX = 6;
const IDLE_FLIP_INTERVAL_MS = 8000;

const GROOM_CLIPS = ['wash_sit', 'wash_stand', 'yawn_sit', 'yawn_stand', 'yawn_sit2'];
const STRESS_IDLE_CLIPS = ['idle_a', 'idle_b', 'wash_sit', 'wash_stand'];

function normalizeNow(now) {
  if (now instanceof Date) return now;
  if (typeof now === 'number' && now > 1e12) return new Date(now);
  return now;
}

function nowMs(now) {
  const n = normalizeNow(now);
  return n instanceof Date ? n.getTime() : n;
}

function getRestMinMs(debug) {
  return debug ? REST_MIN_MS_DEBUG : REST_MIN_MS;
}

function createRhythmState() {
  return {
    segment: null,
    segmentStartedAt: 0,
    segmentUntil: 0,
    arousal: 'calm',
    restClip: null,
    interestArrival: null,
    groomBlocksRemaining: 0,
    roamWalkSteps: 0,
    stressWalkDone: false,
    idleFlipAt: 0,
    pendingAfterGroom: null,
  };
}

function initRhythmOnSession(session) {
  if (!session.rhythm) session.rhythm = createRhythmState();
  return session.rhythm;
}

function isStressSceneKey(sceneKey) {
  return sceneKey === 'overtime-L3' || sceneKey === 'overtime-L4';
}

function canPickSleep(rhythm, sceneKey) {
  if (!rhythm || rhythm.arousal === 'stressed') return false;
  if (isStressSceneKey(sceneKey)) return false;
  // 傍晚收工档禁止睡觉，深夜 done-night 才允许。
  if (sceneKey === 'done-active') return false;
  if (sceneKey === 'onShift') return true;
  return rhythm.arousal === 'calm';
}

function pickFromPool(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickRestClip(rhythm, sceneKey, habit, now, rng) {
  const hour = normalizeNow(now).getHours();
  const arrival = rhythm.interestArrival;

  if (arrival === 'windowsill') {
    return rng() < 0.5 ? 'idle_a' : 'idle_b';
  }
  if (arrival === 'catBed' && canPickSleep(rhythm, sceneKey)) {
    const side = sleepSide(habit, rng);
    return rng() < 0.5 ? `sleep1_${side}` : `sleep2_${side}`;
  }
  if (sceneKey === 'onShift' && hour >= 14 && hour < 16 && canPickSleep(rhythm, sceneKey)) {
    const side = sleepSide(habit, rng);
    return rng() < 0.6 ? `sleep1_${side}` : `sleep2_${side}`;
  }
  if (canPickSleep(rhythm, sceneKey) && arrival === 'centerRug' && rng() < 0.35) {
    const side = sleepSide(habit, rng);
    return `sleep1_${side}`;
  }
  return rng() < 0.5 ? 'idle_a' : 'idle_b';
}

function applyClockBias(weights, sceneKey, now) {
  const hour = normalizeNow(now).getHours();
  const next = { ...weights };

  if (sceneKey === 'onShift') {
    if (hour >= 9 && hour < 11) next.ROAM = (next.ROAM || 0) * 1.2;
    if (hour >= 14 && hour < 16) next.REST = (next.REST || 0) * 1.5;
    if (hour >= 16 && hour < 18) next.ROAM = (next.ROAM || 0) * 1.15;
  }
  if (sceneKey === 'offDuty') {
    next.ROAM = (next.ROAM || 0) * 1.3;
  }
  return next;
}

function baseSegmentWeights(sceneKey, rhythm) {
  if (rhythm.arousal === 'stressed' || isStressSceneKey(sceneKey)) {
    return { ROAM: 45, STRESS_COOLDOWN: 55, REST: 0, GROOM: 0, EAT: 0 };
  }
  if (sceneKey === 'lunch') {
    return { EAT: 50, REST: 35, ROAM: 15, GROOM: 0, STRESS_COOLDOWN: 0 };
  }
  if (sceneKey === 'dinner') {
    return { EAT: 40, REST: 30, ROAM: 20, GROOM: 10, STRESS_COOLDOWN: 0 };
  }
  if (sceneKey === 'onShift') {
    return { ROAM: 58, REST: 27, GROOM: 15, EAT: 0, STRESS_COOLDOWN: 0 };
  }
  if (sceneKey === 'done-active') {
    return { ROAM: 72, REST: 16, GROOM: 12, EAT: 0, STRESS_COOLDOWN: 0 };
  }
  if (sceneKey === 'offDuty' || sceneKey === 'beforeWork') {
    return { ROAM: 52, REST: 30, GROOM: 18, EAT: 0, STRESS_COOLDOWN: 0 };
  }
  if (sceneKey === 'done-night') {
    return { REST: 70, ROAM: 20, GROOM: 10, EAT: 0, STRESS_COOLDOWN: 0 };
  }
  if (sceneKey.startsWith('overtime-L')) {
    return { STRESS_COOLDOWN: 40, ROAM: 35, REST: 15, GROOM: 10, EAT: 0 };
  }
  return { ROAM: 45, REST: 35, GROOM: 20, EAT: 0, STRESS_COOLDOWN: 0 };
}

function pickWeightedSegment(weightMap, rng) {
  const pool = Object.keys(weightMap)
    .map((key) => ({ key, weight: weightMap[key] || 0 }))
    .filter((p) => p.weight > 0);
  if (!pool.length) return SEGMENT.ROAM;
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i += 1) {
    r -= pool[i].weight;
    if (r <= 0) return pool[i].key;
  }
  return pool[pool.length - 1].key;
}

function enterSegment(rhythm, segment, now, habit, rng, sceneKey, debug) {
  const ms = nowMs(now);
  rhythm.segment = segment;
  rhythm.segmentStartedAt = ms;
  rhythm.stressWalkDone = false;

  if (segment === SEGMENT.REST) {
    rhythm.segmentUntil = ms + getRestMinMs(debug);
    rhythm.restClip = pickRestClip(rhythm, sceneKey, habit, now, rng);
    rhythm.idleFlipAt = ms + IDLE_FLIP_INTERVAL_MS;
    if (rhythm.arousal === 'alert') rhythm.arousal = 'calm';
    return;
  }
  if (segment === SEGMENT.GROOM) {
    rhythm.groomBlocksRemaining =
      GROOM_BLOCK_MIN + Math.floor(rng() * (GROOM_BLOCK_MAX - GROOM_BLOCK_MIN + 1));
    rhythm.segmentUntil = ms + 45000;
    return;
  }
  if (segment === SEGMENT.ROAM) {
    rhythm.roamWalkSteps =
      ROAM_WALK_STEPS_MIN +
      Math.floor(rng() * (ROAM_WALK_STEPS_MAX - ROAM_WALK_STEPS_MIN + 1));
    rhythm.segmentUntil = ms + 600000;
    rhythm.interestArrival = null;
    return;
  }
  if (segment === SEGMENT.EAT) {
    rhythm.restClip = 'eat_down';
    rhythm.segmentUntil = ms + EAT_MIN_MS + Math.floor(rng() * (EAT_MAX_MS - EAT_MIN_MS));
    return;
  }
  if (segment === SEGMENT.STRESS_COOLDOWN) {
    rhythm.arousal = 'stressed';
    rhythm.segmentUntil =
      ms + STRESS_COOLDOWN_MIN_MS + Math.floor(rng() * (STRESS_COOLDOWN_MAX_MS - STRESS_COOLDOWN_MIN_MS));
    rhythm.roamWalkSteps = 1 + Math.floor(rng() * 2);
    return;
  }
  rhythm.segmentUntil = ms + 60000;
}

function pickNextSegmentType(rhythm, sceneKey, now, rng) {
  const weights = applyClockBias(baseSegmentWeights(sceneKey, rhythm), sceneKey, now);
  return pickWeightedSegment(weights, rng);
}

function afterRoamSegment(rhythm, sceneKey, rng) {
  if (rhythm.interestArrival && rng() < 0.8) {
    rhythm.pendingAfterGroom = SEGMENT.REST;
    return SEGMENT.GROOM;
  }
  if (sceneKey === 'onShift' && rng() < 0.55) return SEGMENT.ROAM;
  if (sceneKey === 'done-active' && rng() < 0.7) return SEGMENT.ROAM;
  return SEGMENT.REST;
}

function groomClip(rng) {
  return pickFromPool(GROOM_CLIPS, rng);
}

function stressClip(rng, sceneKey) {
  if (sceneKey === 'overtime-L4' && rng() < 0.3) {
    return rng() < 0.55 ? 'hiss_l' : 'sad_sit_down';
  }
  if (sceneKey === 'overtime-L3' && rng() < 0.2) {
    return rng() < 0.5 ? 'hiss_l' : 'sad_sit_down';
  }
  return pickFromPool(STRESS_IDLE_CLIPS, rng);
}

function buildWalkBlock(steps, scene, habit, session, now, rng) {
  const excited = isExcitedPatrol(session, now);
  const target = resolveWalkTarget({
    scene,
    habit,
    session,
    excited,
    rng,
    now,
  });
  return { kind: 'walk', walkSteps: steps, target };
}

function buildGroomBlock(rng) {
  return { kind: 'clip', clip: groomClip(rng), singleCycle: true };
}

function buildRestBlock(rhythm) {
  return { kind: 'clip', clip: rhythm.restClip || 'idle_a', rhythmLoop: true };
}

function buildEatBlock(rhythm) {
  return { kind: 'clip', clip: rhythm.restClip || 'eat_down', rhythmLoop: true };
}

function buildStressBlock(rhythm, rng, stressWalkDone, sceneKey) {
  if (!stressWalkDone) {
    return { kind: 'walk', walkSteps: rhythm.roamWalkSteps || 1, rhythmStress: true };
  }
  return {
    kind: 'clip',
    clip: stressClip(rng, sceneKey),
    singleCycle: true,
    rhythmLoop: true,
  };
}

function blockForActiveSegment(rhythm, ctx) {
  const { scene, habit, session, now, rng, sceneKey } = ctx;
  const ms = nowMs(now);

  if (rhythm.segment === SEGMENT.ROAM) {
    return buildWalkBlock(rhythm.roamWalkSteps, scene, habit, session, now, rng);
  }
  if (rhythm.segment === SEGMENT.GROOM) {
    if (rhythm.groomBlocksRemaining <= 0) return null;
    return buildGroomBlock(rng);
  }
  if (rhythm.segment === SEGMENT.REST) {
    if (ms >= rhythm.segmentUntil) return null;
    return buildRestBlock(rhythm);
  }
  if (rhythm.segment === SEGMENT.EAT) {
    if (ms >= rhythm.segmentUntil) return null;
    return buildEatBlock(rhythm);
  }
  if (rhythm.segment === SEGMENT.STRESS_COOLDOWN) {
    if (ms >= rhythm.segmentUntil) {
      rhythm.arousal = 'calm';
      return null;
    }
    return buildStressBlock(rhythm, rng, rhythm.stressWalkDone, sceneKey);
  }
  return null;
}

function pickNextSegmentAction({
  scene,
  escalation,
  now,
  habit,
  session,
  rng = Math.random,
  doneBand,
  inSleep4Hold,
  debug = false,
}) {
  const rhythm = initRhythmOnSession(session);
  const sceneKey = doneBand || sceneMicroKey(scene, escalation, now);
  const ms = nowMs(now);
  const ctx = { scene, escalation, now, habit, session, rng, doneBand, sceneKey, debug, ms };

  if (inSleep4Hold && sceneKey === 'done-night') {
    const side = sleepSide(habit, rng);
    return { block: { kind: 'hold', clip: `sleep4_${side}` } };
  }

  if (rhythm.segment && ms < rhythm.segmentUntil) {
    const block = blockForActiveSegment(rhythm, ctx);
    if (block) return { block };
  }

  if (rhythm.segment === SEGMENT.GROOM && rhythm.groomBlocksRemaining > 0) {
    const block = buildGroomBlock(rng);
    return { block };
  }

  const nextSeg = pickNextSegmentType(rhythm, sceneKey, now, rng);
  enterSegment(rhythm, nextSeg, now, habit, rng, sceneKey, debug);
  const block = blockForActiveSegment(rhythm, ctx);
  return { block: block || buildRestBlock(rhythm) };
}

function onRhythmBlockComplete(session, block, now, ctx) {
  const rhythm = initRhythmOnSession(session);
  const { scene, habit, rng = Math.random, doneBand, escalation, debug = false } = ctx;
  const sceneKey = doneBand || sceneMicroKey(scene, escalation, now);
  const ms = nowMs(now);

  if (block && block.clip) {
    if (block.clip.startsWith('hiss_') || block.clip.startsWith('sad_')) {
      rhythm.arousal = 'stressed';
    } else if (block.clip.startsWith('paw_attack') && isStressSceneKey(sceneKey)) {
      rhythm.arousal = 'stressed';
    }
  }

  if (block && block.target && block.target.interestId) {
    rhythm.interestArrival = block.target.interestId;
  }

  if (isWalkKind(block && block.kind)) {
    if (rhythm.segment === SEGMENT.STRESS_COOLDOWN) {
      rhythm.stressWalkDone = true;
      if (ms < rhythm.segmentUntil) {
        return { continueSegment: true, block: buildStressBlock(rhythm, rng, true, sceneKey) };
      }
      rhythm.arousal = 'calm';
    }
    if (rhythm.segment === SEGMENT.ROAM) {
      const after = afterRoamSegment(rhythm, sceneKey, rng);
      enterSegment(rhythm, after, now, habit, rng, sceneKey, debug);
      if (after === SEGMENT.GROOM) {
        return { continueSegment: true, block: buildGroomBlock(rng) };
      }
      return { continueSegment: true, block: buildRestBlock(rhythm) };
    }
  }

  if (rhythm.segment === SEGMENT.GROOM) {
    rhythm.groomBlocksRemaining -= 1;
    if (rhythm.groomBlocksRemaining > 0 && ms < rhythm.segmentUntil) {
      return { continueSegment: true, block: buildGroomBlock(rng) };
    }
    const after = rhythm.pendingAfterGroom || SEGMENT.REST;
    rhythm.pendingAfterGroom = null;
    enterSegment(rhythm, after, now, habit, rng, sceneKey, debug);
    if (after === SEGMENT.REST) {
      return { continueSegment: true, block: buildRestBlock(rhythm) };
    }
    return { continueSegment: true, block: blockForActiveSegment(rhythm, ctx) };
  }

  if (rhythm.segment === SEGMENT.REST && ms < rhythm.segmentUntil) {
    return { loopRest: true };
  }

  if (rhythm.segment === SEGMENT.EAT && ms < rhythm.segmentUntil) {
    return { loopRest: true };
  }

  if (rhythm.segment === SEGMENT.STRESS_COOLDOWN) {
    if (rhythm.arousal === 'stressed' && block && block.clip &&
        (block.clip.startsWith('hiss_') || block.clip.startsWith('sad_'))) {
      enterSegment(rhythm, SEGMENT.STRESS_COOLDOWN, now, habit, rng, sceneKey, debug);
      return { continueSegment: true, block: buildStressBlock(rhythm, rng, false, sceneKey) };
    }
    if (ms < rhythm.segmentUntil) {
      if (!rhythm.stressWalkDone) {
        rhythm.stressWalkDone = true;
        return { continueSegment: true, block: buildStressBlock(rhythm, rng, true, sceneKey) };
      }
      return { loopRest: true };
    }
    rhythm.arousal = 'calm';
  }

  if (ms >= rhythm.segmentUntil) {
    rhythm.segment = null;
  }

  return { segmentComplete: true };
}

function shouldFlipRestClip(rhythm, now) {
  const ms = nowMs(now);
  if (rhythm.segment !== SEGMENT.REST) return false;
  if (ms < rhythm.idleFlipAt) return false;
  rhythm.idleFlipAt = ms + IDLE_FLIP_INTERVAL_MS;
  return true;
}

function flipRestClip(rhythm) {
  if (!rhythm.restClip || !rhythm.restClip.startsWith('idle_')) return rhythm.restClip;
  rhythm.restClip = rhythm.restClip === 'idle_a' ? 'idle_b' : 'idle_a';
  return rhythm.restClip;
}

function pauseRhythmForRecovery(session) {
  const rhythm = initRhythmOnSession(session);
  rhythm.recoveryPausedUntil = rhythm.segmentUntil;
  rhythm.recoverySegment = rhythm.segment;
  rhythm.recoveryRemainingMs = Math.max(0, rhythm.segmentUntil - Date.now());
}

function resumeRhythmAfterRecovery(session, now, ctx) {
  const rhythm = initRhythmOnSession(session);
  const ms = nowMs(now);
  if (rhythm.recoverySegment === SEGMENT.REST && rhythm.recoveryRemainingMs > 0) {
    rhythm.segment = SEGMENT.REST;
    rhythm.segmentUntil = ms + Math.max(rhythm.recoveryRemainingMs, getRestMinMs(ctx.debug) / 6);
    rhythm.segmentStartedAt = ms;
    return { block: buildRestBlock(rhythm) };
  }
  rhythm.segment = null;
  return null;
}

function onRhythmExcitedPatrolEnd(session, now, ctx) {
  const rhythm = initRhythmOnSession(session);
  const sceneKey =
    ctx.doneBand ||
    sceneMicroKey(ctx.scene, ctx.escalation || 0, now);
  rhythm.arousal = 'calm';
  rhythm.segment = null;
  enterSegment(rhythm, SEGMENT.REST, now, ctx.habit, ctx.rng || Math.random, sceneKey, ctx.debug);
  rhythm.segmentUntil = nowMs(now) + 120000;
  return buildRestBlock(rhythm);
}

function handleRhythmEscalationJump(session, prevEsc, nextEsc, now, ctx) {
  if (prevEsc < 3 && nextEsc >= 3) {
    const rhythm = initRhythmOnSession(session);
    rhythm.segment = null;
    enterSegment(
      rhythm,
      SEGMENT.STRESS_COOLDOWN,
      now,
      ctx.habit,
      ctx.rng || Math.random,
      sceneMicroKey(ctx.scene, nextEsc, now),
      ctx.debug
    );
    return true;
  }
  return false;
}

function shouldPreserveRhythmOnSceneChange(prevScene, nextScene, rhythm) {
  if (!rhythm || !rhythm.segment) return false;
  // 收工切换场景时不延续上班时的 REST，傍晚应先活跃而非接着睡。
  if (nextScene === 'done') return false;
  if (rhythm.segment !== SEGMENT.REST) return false;
  if (prevScene === nextScene) return true;
  const restMs = rhythm.segmentUntil - Date.now();
  return restMs > 60000;
}

module.exports = {
  SEGMENT,
  REST_MIN_MS,
  REST_MIN_MS_DEBUG,
  createRhythmState,
  initRhythmOnSession,
  getRestMinMs,
  pickNextSegmentAction,
  onRhythmBlockComplete,
  shouldFlipRestClip,
  flipRestClip,
  pauseRhythmForRecovery,
  resumeRhythmAfterRecovery,
  onRhythmExcitedPatrolEnd,
  handleRhythmEscalationJump,
  shouldPreserveRhythmOnSceneChange,
  enterSegment,
  canPickSleep,
  isStressSceneKey,
  pickRestClip,
};
