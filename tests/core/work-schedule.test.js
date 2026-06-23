const assert = require('assert');
const {
  computeDailyWorkHours,
  validateWorkSchedule,
  resolveSegment,
  getLastWorkBlockEnd,
  defaultWorkSchedule,
} = require('../../miniprogram/core/work-schedule');
const { parseTimeToMinutes } = require('../../miniprogram/core/salary');

const defaultSchedule = defaultWorkSchedule('09:00');

assert.strictEqual(computeDailyWorkHours(defaultSchedule, false), 8);

const nightSchedule = defaultWorkSchedule('09:00');
assert.strictEqual(computeDailyWorkHours(nightSchedule, true), 11);

const overlapSchedule = {
  ...defaultSchedule,
  lunch: { start: '12:00', end: '14:00' },
  afternoon: { start: '13:00', end: '18:00' },
};
const overlapResult = validateWorkSchedule(overlapSchedule, false);
assert.strictEqual(overlapResult.ok, false);

const tooShort = {
  morning: { start: '09:00', end: '10:00' },
  lunch: { start: '10:00', end: '10:30' },
  afternoon: { start: '10:30', end: '11:00' },
  eveningRest: { start: '18:00', end: '19:00' },
  nightWork: { start: '19:00', end: '22:00' },
};
assert.strictEqual(validateWorkSchedule(tooShort, false).ok, false);

const tooLong = {
  morning: { start: '06:00', end: '12:00' },
  lunch: { start: '12:00', end: '13:00' },
  afternoon: { start: '13:00', end: '23:00' },
  eveningRest: { start: '23:00', end: '23:15' },
  nightWork: { start: '23:15', end: '23:45' },
};
assert.strictEqual(validateWorkSchedule(tooLong, true).ok, false);

assert.strictEqual(
  resolveSegment(new Date('2026-06-23T12:30:00+08:00'), defaultSchedule, false),
  'lunch'
);

assert.strictEqual(
  getLastWorkBlockEnd(defaultSchedule, false),
  parseTimeToMinutes('18:00')
);
assert.strictEqual(
  getLastWorkBlockEnd(defaultSchedule, true),
  parseTimeToMinutes('22:00')
);

const customStart = defaultWorkSchedule('10:00');
assert.strictEqual(customStart.morning.start, '10:00');
assert.ok(validateWorkSchedule(defaultSchedule, false).ok);
assert.strictEqual(validateWorkSchedule(defaultSchedule, false).hours, 8);

const { migrateSettings } = require('../../miniprogram/services/settings');
const legacy = migrateSettings({
  monthlySalary: 15000,
  workStartTime: '08:30',
  standardHoursPerDay: 8,
});
assert.ok(legacy.workSchedule);
assert.strictEqual(legacy.workSchedule.morning.start, '08:30');
assert.strictEqual(legacy.nightShiftEnabled, false);
assert.strictEqual(legacy.standardHoursPerDay, 8);

const legacyNoHours = migrateSettings({ workStartTime: '09:00' });
assert.strictEqual(legacyNoHours.standardHoursPerDay, 8);

const alreadyMigrated = migrateSettings({
  workSchedule: defaultSchedule,
  nightShiftEnabled: true,
});
assert.strictEqual(alreadyMigrated.nightShiftEnabled, true);

console.log('work-schedule.test.js: ok');
