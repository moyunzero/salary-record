const assert = require('assert');
const {
  hitZone,
  applyHabitToRotations,
  evaluateCompanionNudge,
} = require('../../miniprogram/core/pet-companion');
const { rollDayMood, groomerWashBoost } = require('../../miniprogram/core/pet-habit');

assert.strictEqual(hitZone(36, 10, 72, 72), 'head');
assert.strictEqual(hitZone(36, 50, 72, 72), 'body');
assert.strictEqual(hitZone(36, 65, 72, 72), 'tail');

const habit = {
  groomer: 'high',
  dayMood: 'greedy',
};
const rots = applyHabitToRotations('onShift', [{ clip: 'wash_sit', weight: 0.85 }], habit);
assert.ok(rots[0].weight > 0.85);

assert.strictEqual(groomerWashBoost('high'), 0.2);

const moodA = rollDayMood(42, '2026-06-22');
const moodB = rollDayMood(42, '2026-06-22');
assert.strictEqual(moodA, moodB);
assert.ok(['greedy', 'sleepy', 'playful'].includes(moodA));
const moodC = rollDayMood(42, '2026-06-23');
assert.ok(['greedy', 'sleepy', 'playful'].includes(moodC));

const nudged = {};
const lunchNudge = evaluateCompanionNudge({
  scene: 'lunch',
  escalation: 0,
  prevEscalation: 0,
  morningStart: '09:00',
  lunchStart: '12:00',
  now: new Date('2026-06-23T12:06:00+08:00'),
  nudged,
  habit: { dayMood: 'sleepy' },
});
assert.ok(lunchNudge);
assert.strictEqual(lunchNudge.clip, 'yawn_sit');
assert.strictEqual(lunchNudge.key, 'lunch');

const beforeWorkNudge = evaluateCompanionNudge({
  scene: 'beforeWork',
  escalation: 0,
  prevEscalation: 0,
  morningStart: '09:00',
  lunchStart: '12:00',
  now: new Date('2026-06-23T08:50:00+08:00'),
  nudged: {},
  habit: {},
});
assert.ok(beforeWorkNudge);
assert.strictEqual(beforeWorkNudge.clip, 'yawn_sit');

const otNudge = evaluateCompanionNudge({
  scene: 'overtime',
  escalation: 2,
  prevEscalation: 1,
  morningStart: '09:00',
  lunchStart: '12:00',
  now: new Date('2026-06-23T20:00:00+08:00'),
  nudged: {},
  habit: {},
});
assert.ok(otNudge);
assert.strictEqual(otNudge.key, 'overtime-L2');

const doneArcNudge = evaluateCompanionNudge({
  scene: 'done',
  escalation: 0,
  prevEscalation: 0,
  morningStart: '09:00',
  lunchStart: '12:00',
  now: new Date('2026-06-23T20:00:00+08:00'),
  nudged: {},
  habit: {},
  useArcFsm: true,
});
assert.strictEqual(doneArcNudge, null);

console.log('pet-companion tests passed');
