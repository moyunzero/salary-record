const assert = require('assert');
const {
  filterCompleted,
  sumByDate,
  bucketLast7Days,
  bucketMonth,
  bucketMonthByWeek,
  markRecordKind,
  markedDatesFromRecords,
} = require('../../miniprogram/core/aggregate');

// 标记类型：调休 > 加班倍数 > 普通
assert.strictEqual(markRecordKind({ compLeave: true, premiumMultiplier: 3 }), 'comp');
assert.strictEqual(markRecordKind({ premiumMultiplier: 3 }), 'premium');
assert.strictEqual(markRecordKind({ premiumMultiplier: 1 }), 'work');
assert.strictEqual(markRecordKind({}), 'work');
const marks = markedDatesFromRecords([
  { date: '2026-10-01', endTime: '18:00', earned: 100, premiumMultiplier: 3 },
  { date: '2026-06-20', endTime: '17:00', earned: 0, compLeave: true, premiumMultiplier: 2 },
]);
assert.deepStrictEqual(marks[0], { date: '2026-10-01', kind: 'premium' });
assert.deepStrictEqual(marks[1], { date: '2026-06-20', kind: 'comp' });

const records = [
  { date: '2026-06-20', endTime: '17:00', earned: 100 },
  { date: '2026-06-21', endTime: '18:00', earned: 200 },
  { date: '2026-06-22', endTime: null, earned: 50 },
];

assert.strictEqual(filterCompleted(records).length, 2);
assert.strictEqual(sumByDate(records)['2026-06-21'], 200);

const week = bucketLast7Days(records, new Date('2026-06-22T12:00:00+08:00'));
assert.strictEqual(week.categories.length, 7);
assert.strictEqual(week.data.length, 7);
assert.ok(week.data.some((v) => v === 200));

const monthWeeks = bucketMonthByWeek(records, 2026, 6);
assert.ok(monthWeeks.categories.length >= 4);
assert.strictEqual(monthWeeks.data.reduce((a, b) => a + b, 0), 300);

const month = bucketMonth(records, 2026, 6);
assert.strictEqual(month.categories.length, 30);
assert.strictEqual(month.data[19], 100);
assert.strictEqual(month.data[20], 200);
assert.strictEqual(month.data[0], 0);

console.log('aggregate.test.js: ok');
