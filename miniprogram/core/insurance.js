/**
 * 职工五险个人缴费比例（估算用；工伤、生育个人不缴）。
 * 养老 8%、医疗 2% 为现行全国统一/常见职工比例；失业为降费率政策下常见区间；公积金 5%–12% 为条例下限与常见上限。
 */
const INSURANCE_PERSONAL_LIMITS = {
  pension: { min: 8, max: 8, step: 0, decimals: 1, fixed: true },
  medical: { min: 2, max: 2, step: 0, decimals: 1, fixed: true },
  unemployment: { min: 0.2, max: 0.5, step: 0.1, decimals: 1, fixed: false },
  fund: { min: 5, max: 12, step: 1, decimals: 0, fixed: false },
};

const DEFAULT_INSURANCE = {
  pension: 0.08,
  medical: 0.02,
  unemployment: 0.005,
  fund: 0.12,
};

function roundToDecimals(value, decimals) {
  if (decimals === 2) return Math.round(Number(value) * 100) / 100;
  if (decimals === 0) return Math.round(Number(value));
  return Math.round(Number(value) * 10) / 10;
}

function clampInsurancePercent(percent) {
  const result = {};
  Object.keys(INSURANCE_PERSONAL_LIMITS).forEach((key) => {
    const lim = INSURANCE_PERSONAL_LIMITS[key];
    let v = Number(percent[key]);
    if (!Number.isFinite(v)) v = lim.min;
    v = Math.min(lim.max, Math.max(lim.min, v));
    if (lim.step > 0) {
      v = Math.round(v / lim.step) * lim.step;
      v = Math.min(lim.max, Math.max(lim.min, v));
    }
    result[key] = roundToDecimals(v, lim.decimals);
  });
  return result;
}

function percentToInsurance(percent) {
  const p = clampInsurancePercent(percent);
  return {
    pension: p.pension / 100,
    medical: p.medical / 100,
    unemployment: p.unemployment / 100,
    fund: p.fund / 100,
  };
}

function insuranceToPercent(insurance) {
  return clampInsurancePercent({
    pension: (insurance?.pension ?? 0) * 100,
    medical: (insurance?.medical ?? 0) * 100,
    unemployment: (insurance?.unemployment ?? 0) * 100,
    fund: (insurance?.fund ?? 0) * 100,
  });
}

function clampInsurance(insurance) {
  return percentToInsurance(insuranceToPercent(insurance || {}));
}

function calcTotalInsuranceRate(insurance) {
  const rates = clampInsurance(insurance || DEFAULT_INSURANCE);
  return rates.pension + rates.medical + rates.unemployment + rates.fund;
}

function calcNetMonthly(grossMonthly, insurance) {
  const gross = Number(grossMonthly) || 0;
  const rate = calcTotalInsuranceRate(insurance);
  return gross * (1 - rate);
}

module.exports = {
  INSURANCE_PERSONAL_LIMITS,
  DEFAULT_INSURANCE,
  clampInsurance,
  clampInsurancePercent,
  insuranceToPercent,
  percentToInsurance,
  calcTotalInsuranceRate,
  calcNetMonthly,
};
