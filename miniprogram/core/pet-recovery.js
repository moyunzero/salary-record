const { sleepTier } = require('./pet-interrupt');
const { SEGMENT } = require('./pet-rhythm');

function overlayStep(clip, opts = {}) {
  return {
    clip,
    singleCycle: opts.singleCycle !== false,
    singleFrame: !!opts.singleFrame,
    durationMs: opts.durationMs || (opts.singleFrame ? 1200 : 2800),
    sfx: opts.sfx || 'meow',
    sfxProb: opts.sfxProb != null ? opts.sfxProb : 0.35,
  };
}

function buildSleepTapRecovery(fromClip, habit, rng = Math.random) {
  const tier = sleepTier(fromClip);
  const queue = [];
  if (tier >= 1) {
    queue.push(overlayStep('yawn_sit', { singleCycle: true, sfx: 'nudge.yawn', sfxProb: 0.5 }));
  }
  if (tier <= 2 && rng() < 0.45) {
    queue.push(overlayStep('wash_sit', { singleCycle: true, sfx: 'wash', sfxProb: 0.35 }));
  }
  queue.push(overlayStep(rng() < 0.5 ? 'idle_a' : 'idle_b', { singleCycle: false, durationMs: 2400 }));
  return {
    queue,
    resumeSegment: SEGMENT.REST,
    setsArousal: tier >= 2 ? 'alert' : 'calm',
  };
}

function buildAwakeTapRecovery(ctx) {
  const {
    scene,
    escalation,
    currentClip,
    segment,
    zone,
  } = ctx;
  const queue = [];

  if (scene === 'overtime' && (escalation || 0) >= 3) {
    queue.push(overlayStep('paw_attack_down', { singleCycle: true, sfx: 'scratch', sfxProb: 0.4 }));
    queue.push(overlayStep('hiss_l', { singleFrame: true, sfx: 'hiss', sfxProb: 0.5 }));
    return {
      queue,
      resumeSegment: SEGMENT.STRESS_COOLDOWN,
      setsArousal: 'stressed',
      postWalkSteps: 1,
    };
  }

  if (currentClip && currentClip.startsWith('walk_')) {
    queue.push(overlayStep('meow_stand', { singleCycle: true }));
    if (Math.random() < 0.3) {
      queue.push(overlayStep('scratch_l', { singleCycle: true, sfx: 'scratch', sfxProb: 0.3 }));
    }
    return {
      queue,
      resumeSegment: segment === SEGMENT.ROAM ? SEGMENT.ROAM : SEGMENT.REST,
      setsArousal: 'alert',
    };
  }

  if (segment === SEGMENT.REST || (currentClip && currentClip.startsWith('sleep'))) {
    queue.push(overlayStep('meow_sit', { singleCycle: true }));
    queue.push(overlayStep('idle_b', { singleCycle: false, durationMs: 2600 }));
    return {
      queue,
      resumeSegment: SEGMENT.REST,
      setsArousal: 'alert',
    };
  }

  if (zone === 'head') {
    queue.push(overlayStep('meow_sit', { singleCycle: true }));
  } else {
    queue.push(overlayStep('meow_stand', { singleCycle: true }));
    if (Math.random() < 0.25) {
      queue.push(overlayStep('wash_sit', { singleCycle: true, sfx: 'wash', sfxProb: 0.35 }));
    }
  }

  return {
    queue,
    resumeSegment: segment || SEGMENT.ROAM,
    setsArousal: 'alert',
  };
}

function buildPostHissRecovery() {
  return {
    queue: [
      overlayStep('hiss_l', { singleFrame: true, sfx: 'hiss', sfxProb: 0.5 }),
    ],
    resumeSegment: SEGMENT.STRESS_COOLDOWN,
    setsArousal: 'stressed',
    postWalkSteps: 2,
  };
}

function buildPostExcitedRecovery(rng = Math.random) {
  return {
    queue: [
      overlayStep(rng() < 0.5 ? 'idle_a' : 'idle_b', { singleCycle: false, durationMs: 3000 }),
    ],
    resumeSegment: SEGMENT.REST,
    setsArousal: 'calm',
    restShortMs: 120000,
  };
}

function startRecoveryChain(chainDef) {
  if (!chainDef || !chainDef.queue || !chainDef.queue.length) return null;
  return {
    phase: 'recovery',
    queue: chainDef.queue,
    idx: 0,
    resumeSegment: chainDef.resumeSegment,
    setsArousal: chainDef.setsArousal || null,
    postWalkSteps: chainDef.postWalkSteps || 0,
    restShortMs: chainDef.restShortMs || 0,
    fromClip: chainDef.fromClip || null,
  };
}

function currentRecoveryStep(chain) {
  if (!chain || chain.phase !== 'recovery' || !chain.queue) return null;
  return chain.queue[chain.idx] || null;
}

function advanceRecoveryChain(chain) {
  if (!chain || chain.phase !== 'recovery') return { done: true };
  chain.idx += 1;
  if (chain.idx >= chain.queue.length) {
    return { done: true, chain };
  }
  return { done: false, step: chain.queue[chain.idx], chain };
}

module.exports = {
  buildSleepTapRecovery,
  buildAwakeTapRecovery,
  buildPostHissRecovery,
  buildPostExcitedRecovery,
  startRecoveryChain,
  currentRecoveryStep,
  advanceRecoveryChain,
};
