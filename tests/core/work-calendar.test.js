const assert = require('assert');
const {
  DAY_TYPE,
  REST_SYSTEM,
  isoWeekIndex,
  isWeeklyWorkday,
  resolveDayType,
  isWorkingDayType,
  premiumMultiplierFor,
} = require('../../miniprogram/core/work-calendar');

const holidayMap = require('../../miniprogram/assets/holidays/CN-2026.js');

// 周序号：相邻周差 1，同周差 0
assert.strictEqual(isoWeekIndex('2026-06-29') - isoWeekIndex('2026-06-22'), 1);
assert.strictEqual(isoWeekIndex('2026-06-25') - isoWeekIndex('2026-06-22'), 0);

// 法定节假日 / 调休补班 覆盖每周作息
const double = { restSystem: REST_SYSTEM.DOUBLE };
assert.strictEqual(resolveDayType('2026-10-01', double, holidayMap), DAY_TYPE.STATUTORY_HOLIDAY);
assert.strictEqual(resolveDayType('2026-10-10', double, holidayMap), DAY_TYPE.MAKEUP_WORKDAY); // 国庆补班(周六)
assert.strictEqual(resolveDayType('2026-06-22', double, holidayMap), DAY_TYPE.WORKDAY); // 周一

// 关闭节假日自动休息 → 回退每周作息（2026-10-01 为周四 → 工作日）
assert.strictEqual(
  resolveDayType('2026-10-01', { restSystem: REST_SYSTEM.DOUBLE, holidayAutoRest: false }, holidayMap),
  DAY_TYPE.WORKDAY
);

// 双休 vs 单休：普通周六（2026-06-13，无节假日）
assert.strictEqual(resolveDayType('2026-06-13', double, holidayMap), DAY_TYPE.WEEKLY_REST);
assert.strictEqual(
  resolveDayType('2026-06-13', { restSystem: REST_SYSTEM.SINGLE }, holidayMap),
  DAY_TYPE.WORKDAY
);
// 周日两种制度都休
assert.strictEqual(resolveDayType('2026-06-14', { restSystem: REST_SYSTEM.SINGLE }, holidayMap), DAY_TYPE.WEEKLY_REST);

// 大小周：锚点本周(2026-06-22 所在周)为大周
const bigSmall = {
  restSystem: REST_SYSTEM.BIG_SMALL,
  bigSmall: { anchorWeekDate: '2026-06-22', anchorType: 'big' },
};
assert.strictEqual(isWeeklyWorkday('2026-06-27', bigSmall), true, '大周周六上班');
assert.strictEqual(isWeeklyWorkday('2026-07-04', bigSmall), false, '小周周六休');
assert.strictEqual(isWeeklyWorkday('2026-06-28', bigSmall), false, '周日恒休');
assert.strictEqual(isWeeklyWorkday('2026-06-23', bigSmall), true, '周二恒上');

// 自定义工作日
const custom = { restSystem: REST_SYSTEM.CUSTOM, workWeekdays: [1, 3, 5] };
assert.strictEqual(resolveDayType('2026-06-22', custom, holidayMap), DAY_TYPE.WORKDAY); // 周一
assert.strictEqual(resolveDayType('2026-06-23', custom, holidayMap), DAY_TYPE.WEEKLY_REST); // 周二不在集合

// 倍数与工作日判定
assert.strictEqual(premiumMultiplierFor(DAY_TYPE.STATUTORY_HOLIDAY), 3);
assert.strictEqual(premiumMultiplierFor(DAY_TYPE.WEEKLY_REST), 2);
assert.strictEqual(premiumMultiplierFor(DAY_TYPE.WORKDAY), 1);
assert.strictEqual(isWorkingDayType(DAY_TYPE.MAKEUP_WORKDAY), true);
assert.strictEqual(isWorkingDayType(DAY_TYPE.STATUTORY_HOLIDAY), false);

console.log('work-calendar.test.js: ok');
