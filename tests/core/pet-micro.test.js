const assert = require('assert');
const {
  EXCITED_PATROL_MS,
  EXCITED_COOLDOWN_MS,
  createMicroSession,
  recordTap,
  isExcitedPatrol,
  sceneMicroKey,
  pickNextMicroBehavior,
  resolveWalkTarget,
  onBlockComplete,
  blockUsesForbiddenClip,
  blockUsesDeepSleep,
  isWalkKind,
} = require('../../miniprogram/core/pet-micro');

const habit = {
  napCorner: 'left',
  touchiness: 'high',
  dayMood: 'sleepy',
  groomer: 'mid',
  affinity: 'high',
};

const evening = new Date('2026-06-23T19:00:00+08:00');
const night = new Date('2026-06-23T23:00:00+08:00');
const baseNow = evening.getTime();

function mulberry32(seed) {
  let s = seed >>> 0;
  return function rng() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function monteCarloWalkFraction(opts, samples, seed) {
  let walkCount = 0;
  for (let i = 0; i < samples; i += 1) {
    const session = createMicroSession();
    session.nextEnergyRollAt = baseNow + 999999;
    const block = pickNextMicroBehavior({
      ...opts,
      session,
      rng: mulberry32(seed + i),
      now: evening,
    });
    if (isWalkKind(block.kind)) walkCount += 1;
  }
  return walkCount / samples;
}

// sceneMicroKey
assert.strictEqual(sceneMicroKey('done', 0, evening), 'done-active');
assert.strictEqual(sceneMicroKey('done', 0, night), 'done-night');

// D-M4: overtime-L3 hard gates
for (let i = 0; i < 200; i += 1) {
  const session = createMicroSession();
  session.nextEnergyRollAt = baseNow + 999999;
  const block = pickNextMicroBehavior({
    scene: 'overtime',
    escalation: 3,
    habit,
    session,
    rng: mulberry32(1000 + i),
    now: evening,
  });
  assert.strictEqual(blockUsesForbiddenClip(block), false, `L3 forbidden clip: ${block.clip}`);
  assert.strictEqual(blockUsesDeepSleep(block), false, `L3 deep sleep: ${block.clip}`);
  if (block.clip) {
    assert.ok(!block.clip.startsWith('sleep'), `L3 sleep clip: ${block.clip}`);
  }
}

// D-M4: overtime-L4 same gates + hiss/sad pool presence
let l4HissSad = 0;
for (let i = 0; i < 300; i += 1) {
  const session = createMicroSession();
  session.nextEnergyRollAt = baseNow + 999999;
  const block = pickNextMicroBehavior({
    scene: 'overtime',
    escalation: 4,
    habit,
    session,
    rng: mulberry32(2000 + i),
    now: evening,
  });
  assert.strictEqual(blockUsesForbiddenClip(block), false);
  assert.strictEqual(blockUsesDeepSleep(block), false);
  if (block.clip && (block.clip.startsWith('hiss_') || block.clip.startsWith('sad_'))) {
    l4HissSad += 1;
  }
}
assert.ok(l4HissSad > 50, `L4 hiss/sad under-sampled: ${l4HissSad}`);

// D-M4: done-night inSleep4Hold
for (let i = 0; i < 20; i += 1) {
  const block = pickNextMicroBehavior({
    scene: 'done',
    escalation: 0,
    habit,
    session: createMicroSession(),
    rng: mulberry32(3000 + i),
    now: night,
    inSleep4Hold: true,
  });
  assert.strictEqual(block.kind, 'hold');
  assert.ok(block.clip && block.clip.startsWith('sleep4_'));
}

// D-M2: onShift baseline walk ~40%
const onShiftWalk = monteCarloWalkFraction(
  { scene: 'onShift', escalation: 0, habit },
  500,
  4000,
);
assert.ok(onShiftWalk >= 0.32 && onShiftWalk <= 0.48, `onShift walk ${onShiftWalk}`);

// D-M5: recordTap triggers patrol
const patrolSession = createMicroSession();
const t0 = 1000000;
const patrolStart = t0 + 10000;
assert.strictEqual(recordTap(patrolSession, t0).triggeredPatrol, false);
assert.strictEqual(recordTap(patrolSession, t0 + 5000).triggeredPatrol, false);
assert.strictEqual(recordTap(patrolSession, patrolStart).triggeredPatrol, true);
assert.strictEqual(isExcitedPatrol(patrolSession, patrolStart + 1), true);
assert.strictEqual(isExcitedPatrol(patrolSession, patrolStart + EXCITED_PATROL_MS - 1), true);
assert.strictEqual(isExcitedPatrol(patrolSession, patrolStart + EXCITED_PATROL_MS + 1), false);

// cooldown blocks re-trigger
const cooldownSession = createMicroSession();
const patrolEnd = t0 + EXCITED_PATROL_MS;
cooldownSession.excitedPatrolUntil = patrolEnd;
cooldownSession.excitedCooldownUntil = patrolEnd + EXCITED_COOLDOWN_MS;
assert.strictEqual(recordTap(cooldownSession, patrolEnd + 1000).triggeredPatrol, false);
assert.strictEqual(recordTap(cooldownSession, patrolEnd + 2000).triggeredPatrol, false);
assert.strictEqual(recordTap(cooldownSession, patrolEnd + 3000).triggeredPatrol, false);

// excited patrol on done-night (walk allowed, hold unchanged when flagged)
const nightPatrol = createMicroSession();
recordTap(nightPatrol, t0);
recordTap(nightPatrol, t0 + 1000);
recordTap(nightPatrol, t0 + 2000);
assert.ok(isExcitedPatrol(nightPatrol, t0 + 2500));
const nightHold = pickNextMicroBehavior({
  scene: 'done',
  habit,
  session: nightPatrol,
  rng: () => 0.5,
  now: night,
  inSleep4Hold: true,
});
assert.strictEqual(nightHold.kind, 'hold');

// D-M5: excited active scene walk ~60%
const excitedWalk = monteCarloWalkFraction(
  { scene: 'offDuty', escalation: 0, habit },
  800,
  5000,
);
// Pre-set excited on each sample session
let excitedWalkCount = 0;
for (let i = 0; i < 800; i += 1) {
  const session = createMicroSession();
  session.excitedPatrolUntil = baseNow + EXCITED_PATROL_MS;
  session.nextEnergyRollAt = baseNow + 999999;
  const block = pickNextMicroBehavior({
    scene: 'offDuty',
    escalation: 0,
    habit,
    session,
    rng: mulberry32(6000 + i),
    now: evening,
  });
  if (isWalkKind(block.kind)) excitedWalkCount += 1;
}
const excitedFraction = excitedWalkCount / 800;
assert.ok(excitedFraction >= 0.55 && excitedFraction <= 0.65, `excited walk ${excitedFraction}`);

// D-M6: catBed tx from napCorner
function seqRng(values) {
  let i = 0;
  return () => {
    const v = values[i] ?? values[values.length - 1];
    i += 1;
    return v;
  };
}

const leftTarget = resolveWalkTarget({
  scene: 'lunch',
  habit: { napCorner: 'left' },
  session: createMicroSession(),
  excited: false,
  rng: seqRng([0.01, 0.99]),
  now: evening,
});
assert.strictEqual(leftTarget.interestId, 'catBed');
assert.strictEqual(leftTarget.tx, 0.18);

const rightTarget = resolveWalkTarget({
  scene: 'lunch',
  habit: { napCorner: 'right' },
  session: createMicroSession(),
  excited: false,
  rng: seqRng([0.01, 0.99]),
  now: evening,
});
assert.strictEqual(rightTarget.tx, 0.82);

// visitCount inverse weighting — low-visit point picked more often (lunch allows catBed)
const visitSession = createMicroSession();
visitSession.positionMemory.visitCount = { windowsill: 0, catBed: 10, centerRug: 0 };
let catBedPicks = 0;
let centerRugPicks = 0;
for (let i = 0; i < 200; i += 1) {
  const target = resolveWalkTarget({
    scene: 'lunch',
    habit,
    session: visitSession,
    excited: false,
    rng: mulberry32(7000 + i),
    now: evening,
  });
  if (target.interestId === 'catBed') catBedPicks += 1;
  if (target.interestId === 'centerRug') centerRugPicks += 1;
}
assert.ok(centerRugPicks > catBedPicks, `visitCount bias centerRug=${centerRugPicks} catBed=${catBedPicks}`);

// chain: microChainRemaining set ~35%
let chainHits = 0;
for (let i = 0; i < 1000; i += 1) {
  const session = createMicroSession();
  session.nextEnergyRollAt = baseNow + 999999;
  pickNextMicroBehavior({
    scene: 'offDuty',
    habit,
    session,
    rng: mulberry32(8000 + i),
    now: evening,
  });
  if (session.microChainRemaining > 0) chainHits += 1;
}
assert.ok(chainHits >= 250 && chainHits <= 450, `chain rate ${chainHits / 10}%`);

// onBlockComplete increments visitCount
const completeSession = createMicroSession();
onBlockComplete(completeSession, { target: { interestId: 'centerRug', tx: 0.5, ty: 0.55 } }, { tx: 0.5, ty: 0.55 });
assert.strictEqual(completeSession.positionMemory.visitCount.centerRug, 1);
assert.strictEqual(completeSession.positionMemory.lastIdleTx, 0.5);

console.log('pet-micro tests passed');
