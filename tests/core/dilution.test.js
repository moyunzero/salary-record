const assert = require('assert');
const { calcNetMonthly } = require('../../miniprogram/core/insurance');
const { calcBaseHourly } = require('../../miniprogram/core/salary');
const { calcEarned, buildRecordSnapshot } = require('../../miniprogram/core/dilution');

const settings = {
  monthlySalary: 15000,
  workDaysPerMonth: 21.75,
  standardHoursPerDay: 8,
  insurance: { pension: 0.08, medical: 0.02, unemployment: 0.005, fund: 0.12 },
};

const net = calcNetMonthly(settings.monthlySalary, settings.insurance);
const baseHourly = calcBaseHourly(net, settings.workDaysPerMonth, settings.standardHoursPerDay);

const earned8h = calcEarned(settings, '09:00', '17:00');
assert.ok(Math.abs(earned8h - baseHourly * 8) < 0.02);

const snap8 = buildRecordSnapshot(settings, '09:00', '17:00');
assert.ok(snap8.dilutionPct < 0.05);

const earned10 = calcEarned(settings, '09:00', '19:00');
assert.ok(Math.abs(earned10 - baseHourly * 8) < 0.02, 'overtime caps at standard daily share');

const settings6h = { ...settings, standardHoursPerDay: 6 };
const earned6 = calcEarned(settings6h, '09:00', '15:00');
const base6 = calcBaseHourly(net, settings6h.workDaysPerMonth, 6);
assert.ok(Math.abs(earned6 - base6 * 6) < 0.02);
const earned6plus = calcEarned(settings6h, '09:00', '18:00');
assert.ok(Math.abs(earned6plus - base6 * 6) < 0.02, '6h standard caps at 6h share');

const snap10 = buildRecordSnapshot(settings, '09:00', '19:00');
assert.ok(snap10.dilutionPct >= 0.1);
assert.ok('earned' in snap10 && 'effectiveHourly' in snap10 && 'dilutionPct' in snap10);

// 含作息表时：午休（12:00–13:00）不计薪
const { defaultWorkSchedule } = require('../../miniprogram/core/work-schedule');
const settingsWithSchedule = {
  ...settings,
  workSchedule: defaultWorkSchedule('09:00'),
  nightShiftEnabled: false,
};

// 09:00–18:00 墙钟 9h，扣 1h 午休 = 8h 计薪，恰好等于标准日额、零稀释
const snapDay = buildRecordSnapshot(settingsWithSchedule, '09:00', '18:00');
assert.ok(Math.abs(snapDay.earned - baseHourly * 8) < 0.02, '午休应被扣除，9h 墙钟=8h 计薪');
assert.ok(snapDay.dilutionPct < 0.01, '正常班扣除午休后不应稀释');
assert.ok(Math.abs(snapDay.effectiveHourly - baseHourly) < 0.02);

// 同一区间，无作息表时午休不被扣除（向后兼容），earned 仍封顶在标准日额
const snapNoSchedule = buildRecordSnapshot(settings, '09:00', '18:00');
assert.ok(Math.abs(snapNoSchedule.earned - baseHourly * 8) < 0.02);
// 但有效时薪因未扣午休被摊薄 → 出现稀释，证明两种模型确有差异
assert.ok(snapNoSchedule.dilutionPct > snapDay.dilutionPct, '不扣午休会产生额外稀释');

console.log('dilution.test.js: ok');
