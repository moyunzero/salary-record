const { deepSleepClip, deepestSleepClip, lightSleepClip, resolveDoneBand } = require('./pet-arcs');

function sleepTier(clip) {
  if (!clip || typeof clip !== 'string' || !clip.startsWith('sleep')) return 0;
  const n = Number(clip.charAt(5));
  if (n <= 2) return 1;
  if (n === 3) return 2;
  if (n >= 4) return 3;
  return 0;
}

function isSleepClip(clip) {
  return sleepTier(clip) > 0;
}

function pickWeighted(pool, rng = Math.random) {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i += 1) {
    r -= pool[i].weight;
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function touchinessHissBoost(touchiness) {
  if (touchiness === 'high') return 0.12;
  if (touchiness === 'mid') return 0.05;
  return 0;
}

function pickSleepInterrupt(clip, habit, rng = Math.random) {
  const tier = sleepTier(clip);
  const touchiness = (habit && habit.touchiness) || 'low';
  const hissBoost = touchinessHissBoost(touchiness);

  let pool;
  if (tier === 1) {
    pool = [
      { clip: 'yawn_sit', weight: 65, singleCycle: true, sfx: 'nudge.yawn' },
      { clip: 'meow_sit', weight: 22, sfx: 'meow' },
      { clip: 'scratch_l', weight: 8, sfx: 'scratch' },
      { clip: 'hiss_l', weight: 5 + hissBoost, singleFrame: true, sfx: 'hiss' },
    ];
  } else if (tier === 2) {
    pool = [
      { clip: 'yawn_sit', weight: 50, singleCycle: true, sfx: 'nudge.yawn' },
      { clip: 'wash_sit', weight: 22, sfx: 'wash' },
      { clip: 'meow_sit', weight: 15, sfx: 'meow' },
      { clip: 'hiss_l', weight: 10 + hissBoost, singleFrame: true, sfx: 'hiss' },
      { clip: '__resume_sleep3', weight: 3, resume: true },
    ];
  } else if (tier === 3) {
    const hissW = Math.min(35, 20 + hissBoost * 100);
    pool = [
      { clip: 'yawn_lie', weight: 40, singleCycle: true, sfx: 'nudge.yawn' },
      { clip: 'meow_lie', weight: 20, sfx: 'meow' },
      { clip: 'wash_lie', weight: 15, sfx: 'wash' },
      { clip: 'hiss_l', weight: hissW, singleFrame: true, sfx: 'hiss' },
      { clip: '__resume_sleep4', weight: 5, resume: true },
    ];
  } else {
    return { clip: 'yawn_sit', singleCycle: true, sfx: 'nudge.yawn' };
  }

  const pick = pickWeighted(pool, rng);
  if (pick.resume) {
    return {
      clip: tier >= 3 ? 'yawn_sit' : pick.clip,
      singleCycle: true,
      resumeSleep: tier >= 3 ? 'sleep4' : 'sleep3',
      sfx: 'nudge.yawn',
    };
  }
  return {
    clip: pick.clip,
    singleCycle: !!pick.singleCycle,
    singleFrame: !!pick.singleFrame,
    sfx: pick.sfx,
    sfxProb: pick.sfx === 'hiss' ? 0.5 : 0.35,
  };
}

const AWAKE_TAP_POOLS = {
  onShift: [
    { clip: 'meow_sit', weight: 0.6 },
    { clip: 'wash_sit', weight: 0.25, singleCycle: true },
    { clip: 'idle_b', weight: 0.15 },
  ],
  drowse: [
    { clip: 'yawn_sit', weight: 0.4, singleCycle: true },
    { clip: 'meow_sit', weight: 0.35 },
    { clip: 'idle_b', weight: 0.25 },
  ],
  accompany: [
    { clip: 'meow_sit', weight: 0.5 },
    { clip: 'scratch_l', weight: 0.25, singleCycle: true },
    { clip: 'wash_sit', weight: 0.25, singleCycle: true },
  ],
  feast: [
    { clip: 'meow_sit', weight: 0.45 },
    { clip: 'eat_down', weight: 0.35, singleCycle: true },
    { clip: 'yawn_sit', weight: 0.2, singleCycle: true },
  ],
  explore: [
    { clip: 'meow_stand', weight: 0.5 },
    { clip: 'paw_attack_down', weight: 0.25, singleCycle: true },
    { clip: 'scratch_l', weight: 0.25, singleCycle: true },
  ],
  default: [
    { clip: 'meow_stand', weight: 0.6 },
    { clip: 'paw_attack_down', weight: 0.2, singleCycle: true },
    { clip: 'scratch_l', weight: 0.1, singleCycle: true },
    { clip: 'scratch_r', weight: 0.1, singleCycle: true },
  ],
};

function pickAwakeTap(scene, arcId, currentClip, escalation, rng = Math.random) {
  if (currentClip && currentClip.startsWith('walk_')) {
    return { clip: 'meow_stand', singleCycle: true, sfx: 'meow', sfxProb: 0.35 };
  }
  if (currentClip === 'eat_down') {
    return rng() < 0.5
      ? { clip: 'meow_sit', sfx: 'meow', sfxProb: 0.3 }
      : { clip: 'eat_down', singleCycle: true, sfx: 'eat', sfxProb: 0.25 };
  }

  if (scene === 'overtime') {
    const level = Math.min(4, Math.max(1, escalation || 1));
    const pool = level >= 3
      ? [
          { clip: 'paw_attack_down', weight: 0.7, singleCycle: true },
          { clip: 'hiss_l', weight: 0.3, singleFrame: true },
        ]
      : [
          { clip: 'meow_stand', weight: 0.5 },
          { clip: 'yawn_sit', weight: 0.5, singleCycle: true },
        ];
    const pick = pickWeighted(pool, rng);
    return {
      clip: pick.clip,
      singleCycle: !!pick.singleCycle,
      singleFrame: !!pick.singleFrame,
      sfx: pick.clip === 'hiss_l' ? 'hiss' : 'meow',
      sfxProb: 0.35,
    };
  }

  const key =
    arcId === 'accompany' ||
    arcId === 'drowse' ||
    arcId === 'feast' ||
    arcId === 'explore' ||
    arcId === 'homeLife'
      ? arcId
      : scene === 'done' && resolveDoneBand(Date.now()) === 'done-active'
        ? 'explore'
        : AWAKE_TAP_POOLS[scene]
          ? scene
          : 'default';
  const pool = AWAKE_TAP_POOLS[key] || AWAKE_TAP_POOLS.default;
  const pick = pickWeighted(pool, rng);
  return {
    clip: pick.clip,
    singleCycle: !!pick.singleCycle,
    singleFrame: !!pick.singleFrame,
    sfx: 'meow',
    sfxProb: 0.3,
  };
}

function postInterruptResume(ctx) {
  const {
    scene,
    fromClip,
    habit,
    rng = Math.random,
    now = Date.now(),
  } = ctx;

  const tier = sleepTier(fromClip);
  const side = fromClip && fromClip.endsWith('_r') ? 'r' : 'l';

  if (scene === 'done') {
    if (resolveDoneBand(now) === 'done-night') {
      return { clip: deepestSleepClip(habit, rng), resumeArc: true };
    }
    return { clip: rng() < 0.5 ? 'idle_a' : 'idle_b', resumeArc: false };
  }

  if (tier === 3) {
    if (rng() < 0.5) {
      return { clip: `sleep4_${side}`, resumeArc: true };
    }
    return { clip: `sleep3_${side}`, resumeArc: true };
  }

  if (scene === 'lunch' || scene === 'offDuty' || scene === 'beforeWork') {
    if (rng() < 0.4) {
      return { clip: lightSleepClip(habit, rng), resumeArc: true };
    }
  }

  return { clip: rng() < 0.5 ? 'idle_a' : 'idle_b', resumeArc: false, drowse: true };
}

const POST_INTERRUPT_YAWN = { clip: 'yawn_sit', singleCycle: true, sfx: 'nudge.yawn', sfxProb: 0.5 };

function canCompanionNudgeDuringArc(currentClip, interruptActive) {
  if (interruptActive) return false;
  const tier = sleepTier(currentClip);
  if (tier >= 3) return false;
  if (tier >= 2) return false;
  return true;
}

function shouldPostInterruptYawn(fromClip, interruptClip) {
  if (!fromClip || sleepTier(fromClip) < 2) return true;
  if (interruptClip && (interruptClip.startsWith('yawn') || interruptClip === 'wash_lie')) {
    return false;
  }
  return true;
}

module.exports = {
  sleepTier,
  isSleepClip,
  pickSleepInterrupt,
  pickAwakeTap,
  postInterruptResume,
  POST_INTERRUPT_YAWN,
  canCompanionNudgeDuringArc,
  shouldPostInterruptYawn,
};
