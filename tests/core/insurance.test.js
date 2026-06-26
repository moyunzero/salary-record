const assert = require('assert');
const {
  DEFAULT_INSURANCE,
  calcNetMonthly,
  calcTotalInsuranceRate,
  clampInsurance,
  clampInsurancePercent,
  insuranceToPercent,
} = require('../../miniprogram/core/insurance');

assert.ok(calcTotalInsuranceRate(DEFAULT_INSURANCE) > 0);
const net = calcNetMonthly(10000, DEFAULT_INSURANCE);
assert.ok(net < 10000 && net > 0);

const clamped = clampInsurance({ pension: 0, medical: 0, unemployment: 0.01, fund: 0.2 });
assert.strictEqual(clamped.pension, 0.08);
assert.strictEqual(clamped.medical, 0.02);
assert.strictEqual(clamped.unemployment, 0.005);
assert.strictEqual(clamped.fund, 0.12);

assert.deepStrictEqual(clampInsurancePercent({ pension: 8, medical: 2, unemployment: 0.3, fund: 7 }), {
  pension: 8,
  medical: 2,
  unemployment: 0.3,
  fund: 7,
});

assert.deepStrictEqual(insuranceToPercent({ pension: 0.08, medical: 0.02, unemployment: 0.004, fund: 0.11 }), {
  pension: 8,
  medical: 2,
  unemployment: 0.4,
  fund: 11,
});

console.log('insurance.test.js: ok');
