const assert = require('assert');
const { DEFAULT_INSURANCE, calcNetMonthly, calcTotalInsuranceRate } = require('../../miniprogram/core/insurance');

assert.ok(calcTotalInsuranceRate(DEFAULT_INSURANCE) > 0);
const net = calcNetMonthly(10000, DEFAULT_INSURANCE);
assert.ok(net < 10000 && net > 0);

const zeroRates = { pension: 0, medical: 0, unemployment: 0, fund: 0 };
assert.strictEqual(calcNetMonthly(12000, zeroRates), 12000);

console.log('insurance.test.js: ok');
