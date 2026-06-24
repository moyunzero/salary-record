const assert = require('assert');
const {
  computeDailyWorkHours,
  validateWorkSchedule,
  resolveSegment,
  getLastWorkBlockEnd,
  defaultWorkSchedule,
  restWindows,
  restOverlapMinutes,
  currentRestWindow,
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

// 工作日 / 自动开始 默认值
assert.deepStrictEqual(legacy.workWeekdays, [1, 2, 3, 4, 5]);
assert.strictEqual(legacy.autoStartEnabled, true);
assert.deepStrictEqual(alreadyMigrated.workWeekdays, [1, 2, 3, 4, 5]);
const keepsWeekdays = migrateSettings({ workSchedule: defaultSchedule, workWeekdays: [1, 3, 5] });
assert.deepStrictEqual(keepsWeekdays.workWeekdays, [1, 3, 5]);

// 工作制 / 节假日字段迁移补全
assert.strictEqual(legacy.restSystem, 'double_rest');
assert.strictEqual(legacy.holidayAutoRest, true);
assert.strictEqual(legacy.compLeaveBalance, 0);
assert.deepStrictEqual(legacy.bigSmall, { anchorWeekDate: '', anchorType: 'big' });
const keepsRest = migrateSettings({ restSystem: 'big_small_week', holidayAutoRest: false });
assert.strictEqual(keepsRest.restSystem, 'big_small_week');
assert.strictEqual(keepsRest.holidayAutoRest, false);

// 休息窗口：日班仅午休，夜班含晚休
const dayRest = restWindows(defaultSchedule, false);
assert.strictEqual(dayRest.length, 1);
assert.strictEqual(dayRest[0].label, '午休');
assert.strictEqual(dayRest[0].start, parseTimeToMinutes('12:00'));
assert.strictEqual(dayRest[0].end, parseTimeToMinutes('13:00'));

const nightRest = restWindows(defaultSchedule, true);
assert.strictEqual(nightRest.length, 2);
assert.strictEqual(nightRest[1].label, '晚休');
assert.strictEqual(restWindows(null, true).length, 0);

// 重叠分钟：跨越整个午休应扣 60，未进入午休应为 0
const lunchWin = restWindows(defaultSchedule, false);
assert.strictEqual(
  restOverlapMinutes(parseTimeToMinutes('09:00'), parseTimeToMinutes('18:00'), lunchWin),
  60
);
assert.strictEqual(
  restOverlapMinutes(parseTimeToMinutes('09:00'), parseTimeToMinutes('11:30'), lunchWin),
  0
);
// 部分进入午休（12:00–12:20）只扣 20 分钟
assert.strictEqual(
  restOverlapMinutes(parseTimeToMinutes('09:00'), parseTimeToMinutes('12:20'), lunchWin),
  20
);
// 打卡晚于午休（14:00 起）不扣
assert.strictEqual(
  restOverlapMinutes(parseTimeToMinutes('14:00'), parseTimeToMinutes('18:00'), lunchWin),
  0
);

// 当前休息窗口判定
assert.strictEqual(currentRestWindow(parseTimeToMinutes('12:30'), lunchWin).label, '午休');
assert.strictEqual(currentRestWindow(parseTimeToMinutes('13:00'), lunchWin), null);
assert.strictEqual(currentRestWindow(parseTimeToMinutes('10:00'), lunchWin), null);
assert.strictEqual(currentRestWindow(parseTimeToMinutes('18:30'), nightRest).label, '晚休');

console.log('work-schedule.test.js: ok');
