const { parseTimeToMinutes } = require('./salary');
const { groomerWashBoost } = require('./pet-habit');

const HEAD_PAT_COOLDOWN_MS = 12000;
const COMBO_COOLDOWN_MS = 6000;
const COMBO_WINDOW_MS = 1200;
const COMBO_TAP_COUNT = 3;
const GROOM_BEAT_MIN_MS = 60000;
const GROOM_BEAT_MAX_MS = 120000;

function minutesFromDate(now) {
  if (typeof now === 'number') {
    if (now > 1e12) return minutesFromDate(new Date(now));
    return now;
  }
  return now.getHours() * 60 + now.getMinutes();
}

function hitZone(localX, localY, width, height) {
  const x = localX / width;
  const y = localY / height;
  if (y < 0.3) return 'head';
  if (y >= 0.8) return 'tail';
  return 'body';
}

function cloneRotations(rotations) {
  return rotations.map((r) => ({ ...r }));
}

function applyHabitToRotations(scene, rotations, habit) {
  if (!rotations || !rotations.length || !habit) return rotations;
  const pool = cloneRotations(rotations);
  const washBoost = groomerWashBoost(habit.groomer);

  for (let i = 0; i < pool.length; i += 1) {
    if (pool[i].clip === 'wash_sit' && washBoost > 0) {
      pool[i].weight += washBoost;
    }
    if (scene === 'lunch' && habit.dayMood === 'greedy' && pool[i].clip.startsWith('sleep')) {
      pool[i].weight *= 0.85;
    }
    if (scene === 'beforeWork' && habit.dayMood === 'greedy' && pool[i].clip === 'eat_down') {
      pool[i].weight *= 1.15;
    }
  }

  return pool;
}

function pickHeadPatReaction(touchiness) {
  const r = Math.random();
  if (touchiness === 'high') {
    if (r < 0.1) return { clip: 'hiss_l', durationMs: 1000, singleFrame: true, sfx: 'hiss', sfxProb: 0.4 };
    if (r < 0.4) return { clip: 'scratch_l', durationMs: 2000, sfx: 'scratch', sfxProb: 0.4 };
  }
  if (touchiness === 'mid' && r < 0.5) {
    return { clip: 'wash_sit', durationMs: 2500, sfx: 'purr', sfxProb: 0.4 };
  }
  return { clip: 'idle_b', durationMs: 3000, sfx: 'purr', sfxProb: 0.4 };
}

function comboClipForScene(scene) {
  if (scene === 'lunch' || scene === 'dinner') {
    return { clip: 'eat_down', singleCycle: true, durationMs: 2800, sfx: 'eat', sfxProb: 0.2 };
  }
  if (scene === 'done') {
    return { clip: 'sleep1_l', durationMs: 2500, sfx: 'sleep', sfxProb: 0.2 };
  }
  return { clip: 'paw_attack_down', durationMs: 2200, sfx: 'paw', sfxProb: 0.2 };
}

function roamTargetRatios(scene, habit) {
  const affinity = habit && habit.affinity;
  const corner = habit && habit.napCorner;
  let txMin = 0.06;
  let txMax = 0.94;
  let tyMin = 0.1;
  let tyMax = 0.82;

  if (scene === 'done' || scene === 'lunch') {
    if (corner === 'left') {
      txMin = 0.06;
      txMax = 0.38;
    } else if (corner === 'right') {
      txMin = 0.62;
      txMax = 0.94;
    } else {
      txMin = 0.32;
      txMax = 0.68;
    }
  } else if (affinity === 'high') {
    txMin = 0.32;
    txMax = 0.68;
    tyMin = 0.35;
    tyMax = 0.75;
  } else if (affinity === 'low') {
    txMin = 0.06;
    txMax = 0.94;
  }

  return {
    tx: txMin + Math.random() * (txMax - txMin),
    ty: tyMin + Math.random() * (tyMax - tyMin),
  };
}

function groomBeatDelayMs(seed) {
  const span = GROOM_BEAT_MAX_MS - GROOM_BEAT_MIN_MS;
  return GROOM_BEAT_MIN_MS + (Math.abs(seed) % span);
}

function evaluateCompanionNudge(ctx) {
  const {
    scene,
    escalation,
    prevEscalation,
    morningStart,
    lunchStart,
    now,
    nudged,
    habit,
    useArcFsm,
  } = ctx;

  if (!scene || !nudged) return null;

  const nowMinutes = minutesFromDate(now);
  const nudgeKey = scene === 'overtime' ? `overtime-L${escalation}` : scene;
  if (nudged[nudgeKey]) return null;

  if (scene === 'beforeWork' && morningStart) {
    const start = parseTimeToMinutes(morningStart);
    const diff = start - nowMinutes;
    if (diff >= 0 && diff <= 15) {
      return {
        key: nudgeKey,
        clip: 'yawn_sit',
        singleCycle: true,
        durationMs: 3200,
        sfx: 'nudge.yawn',
        sfxProb: 1,
      };
    }
  }

  if (scene === 'lunch' && lunchStart) {
    const lunchStartMin = parseTimeToMinutes(lunchStart);
    if (nowMinutes - lunchStartMin >= 5) {
      const greedy = habit && habit.dayMood === 'greedy';
      return {
        key: nudgeKey,
        clip: greedy ? 'eat_down' : 'yawn_sit',
        singleCycle: true,
        durationMs: greedy ? 2800 : 3200,
        sfx: greedy ? 'eat' : 'nudge.yawn',
        sfxProb: 1,
      };
    }
  }

  if (scene === 'overtime' && escalation === 2 && prevEscalation !== 2) {
    return {
      key: 'overtime-L2',
      clip: 'meow_stand',
      durationMs: 2800,
      sfx: 'meow',
      sfxProb: 1,
    };
  }

  if (scene === 'done') {
    if (useArcFsm) return null;
    return {
      key: nudgeKey,
      clip: 'sleep1_l',
      singleCycle: true,
      durationMs: 3000,
      sfx: 'sleep',
      sfxProb: 1,
    };
  }

  return null;
}

module.exports = {
  HEAD_PAT_COOLDOWN_MS,
  COMBO_COOLDOWN_MS,
  COMBO_WINDOW_MS,
  COMBO_TAP_COUNT,
  hitZone,
  applyHabitToRotations,
  pickHeadPatReaction,
  comboClipForScene,
  roamTargetRatios,
  groomBeatDelayMs,
  evaluateCompanionNudge,
};
