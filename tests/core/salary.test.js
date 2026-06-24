const assert = require('assert');
const { minutesBetween, calcBaseHourly } = require('../../miniprogram/core/salary');

assert.strictEqual(minutesBetween('09:00', '17:00'), 480);
assert.strictEqual(minutesBetween('17:00', '09:00'), 0);

const hourly = calcBaseHourly(10000, 21.75, 8);
assert.ok(hourly > 0);

console.log('salary.test.js: ok');
