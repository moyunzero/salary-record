const assert = require('assert');
const {
  pickArc,
  resolveArcStep,
  sceneArcKey,
  resolveDoneBand,
  SCENE_ARC_ALLOW,
  stepCycleMs,
  allowsArcRoam,
  shouldHoldAfterTerminal,
  ambientWalkKey,
  nextAmbientWalkDelay,
} = require('../../miniprogram/core/pet-arcs');
const {
  sleepTier,
  isSleepClip,
  pickSleepInterrupt,
  postInterruptResume,
  canCompanionNudgeDuringArc,
  shouldPostInterruptYawn,
} = require('../../miniprogram/core/pet-interrupt');

const habit = {
  napCorner: 'left',
  touchiness: 'high',
  dayMood: 'sleepy',
  groomer: 'mid',
};

const evening = new Date('2026-06-23T19:00:00+08:00');
const night = new Date('2026-06-23T23:00:00+08:00');

assert.strictEqual(sceneArcKey('overtime', 3), 'overtime-L3');
assert.strictEqual(sceneArcKey('done', 0, evening), 'done-active');
assert.strictEqual(sceneArcKey('done', 0, night), 'done-night');
assert.strictEqual(resolveDoneBand(evening), 'done-active');
assert.strictEqual(resolveDoneBand(night), 'done-night');
assert.strictEqual(
  resolveDoneBand(evening.getTime()),
  'done-active',
  'resolveDoneBand must treat ms timestamp as wall clock'
);
assert.strictEqual(sceneArcKey('done', 0, evening.getTime()), 'done-active');

assert.deepStrictEqual(SCENE_ARC_ALLOW.onShift, ['accompany', 'drowse']);
assert.ok(SCENE_ARC_ALLOW['done-active'].includes('homeLife'));
assert.ok(SCENE_ARC_ALLOW['done-night'].includes('settle'));

const doneEvening = pickArc('done', habit, 0, () => 0.01, evening);
assert.ok(['homeLife', 'explore', 'nap', 'drowse', 'feast'].includes(doneEvening.arcId));

const doneNight = pickArc('done', habit, 0, () => 0.01, night);
assert.strictEqual(doneNight.arcId, 'settle');

assert.strictEqual(ambientWalkKey('done', evening), 'done-active');
assert.strictEqual(ambientWalkKey('done', night), null);
assert.ok(nextAmbientWalkDelay('done-active') >= 5500);

const homeWalk = resolveArcStep('homeLife', 0, { habit, rng: () => 0.5, walkRemaining: 2 });
assert.strictEqual(homeWalk.kind, 'walk');
assert.strictEqual(homeWalk.walkRemaining, 2);
assert.ok(allowsArcRoam('homeLife', homeWalk));

assert.strictEqual(shouldHoldAfterTerminal('done', 'settle', night), true);
assert.strictEqual(shouldHoldAfterTerminal('done', 'settle', evening), false);

const settleStep0 = resolveArcStep('settle', 0, { habit, rng: () => 0.5 });
assert.strictEqual(settleStep0.clip, 'yawn_sit');

const settleStep2 = resolveArcStep('settle', 2, { habit, rng: () => 0.5 });
assert.ok(settleStep2.clip.startsWith('sleep4_'));
assert.strictEqual(settleStep2.terminal, true);

assert.strictEqual(sleepTier('sleep4_r'), 3);
assert.strictEqual(isSleepClip('sleep4_l'), true);

const doneNightResume = postInterruptResume({
  scene: 'done',
  fromClip: 'sleep4_l',
  habit,
  now: night,
  rng: () => 0.1,
});
assert.ok(doneNightResume.clip.startsWith('sleep4_'));

const doneEveningResume = postInterruptResume({
  scene: 'done',
  fromClip: 'sleep2_l',
  habit,
  now: evening,
  rng: () => 0.99,
});
assert.ok(
  doneEveningResume.clip === 'idle_a' || doneEveningResume.clip === 'idle_b',
  'done-active evening should stay awake after interrupt'
);
assert.strictEqual(doneEveningResume.resumeArc, false);

assert.strictEqual(shouldPostInterruptYawn('sleep4_l', 'yawn_lie'), false);
assert.strictEqual(canCompanionNudgeDuringArc('sleep4_l', false), false);

console.log('pet-arcs tests passed');
