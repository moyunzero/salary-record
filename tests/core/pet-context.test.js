const assert = require('assert');
const { resolvePetContext } = require('../../miniprogram/core/pet-context');
const { defaultWorkSchedule } = require('../../miniprogram/core/work-schedule');

const schedule = defaultWorkSchedule('09:00');

const settings = {
  workSchedule: schedule,
  nightShiftEnabled: false,
  standardHoursPerDay: 8,
};

const settingsWithNight = {
  workSchedule: schedule,
  nightShiftEnabled: true,
  standardHoursPerDay: 11,
};

function at(timeStr) {
  return new Date(`2026-06-23T${timeStr}:00+08:00`);
}

// T8: done → done, escalation 0
const done = resolvePetContext('done', at('14:00'), settings);
assert.strictEqual(done.context, 'done');
assert.strictEqual(done.escalation, 0);

// T3: working @ 12:30 → lunch
const lunch = resolvePetContext('working', at('12:30'), settings);
assert.strictEqual(lunch.context, 'lunch');
assert.strictEqual(lunch.escalation, 0);

// T4: working @ 19:00 with night shift → nightShift
const night = resolvePetContext('working', at('19:00'), settingsWithNight);
assert.strictEqual(night.context, 'nightShift');
assert.strictEqual(night.escalation, 0);

// T5: working @ 19:00 no night shift → overtime L2+
const ot = resolvePetContext('working', at('19:00'), settings);
assert.strictEqual(ot.context, 'overtime');
assert.ok(ot.escalation >= 2);

// T6: working @ 23:30 → overtime L3
const late = resolvePetContext('working', at('23:30'), settings);
assert.strictEqual(late.context, 'overtime');
assert.strictEqual(late.escalation, 3);

// onShift: working @ 10:00 morning
const onShift = resolvePetContext('working', at('10:00'), settings);
assert.strictEqual(onShift.context, 'onShift');
assert.strictEqual(onShift.escalation, 0);

// dinner: idle @ 18:30 eveningRest with night enabled
const dinner = resolvePetContext('idle', at('18:30'), settingsWithNight);
assert.strictEqual(dinner.context, 'dinner');
assert.strictEqual(dinner.escalation, 0);

// beforeWork: idle before morning start
const beforeWork = resolvePetContext('idle', at('08:00'), settings);
assert.strictEqual(beforeWork.context, 'beforeWork');
assert.strictEqual(beforeWork.escalation, 0);

// overtime L1: 30min past last end (18:30)
const l1 = resolvePetContext('working', at('18:30'), settings);
assert.strictEqual(l1.context, 'overtime');
assert.strictEqual(l1.escalation, 1);

// overtime L2: 90min past last end (19:30)
const l2 = resolvePetContext('working', at('19:30'), settings);
assert.strictEqual(l2.context, 'overtime');
assert.strictEqual(l2.escalation, 2);

// overtime L4: L3 sustained >10min via l3EnteredAt option
const l4 = resolvePetContext('working', at('20:15'), settings, {
  l3EnteredAt: at('20:00'),
});
assert.strictEqual(l4.context, 'overtime');
assert.strictEqual(l4.escalation, 4);

// distinct contexts: lunch vs overtime
assert.notStrictEqual(lunch.context, ot.context);

// nightShift beats overtime when in nightWork segment
assert.notStrictEqual(night.context, ot.context);

console.log('pet-context.test.js: ok');
