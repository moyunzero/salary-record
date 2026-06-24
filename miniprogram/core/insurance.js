const DEFAULT_INSURANCE = {
  pension: 0.08,
  medical: 0.02,
  unemployment: 0.005,
  fund: 0.12,
};

function calcTotalInsuranceRate(insurance) {
  const rates = insurance || DEFAULT_INSURANCE;
  return rates.pension + rates.medical + rates.unemployment + rates.fund;
}

function calcNetMonthly(grossMonthly, insurance) {
  const gross = Number(grossMonthly) || 0;
  const rate = calcTotalInsuranceRate(insurance);
  return gross * (1 - rate);
}

module.exports = {
  DEFAULT_INSURANCE,
  calcTotalInsuranceRate,
  calcNetMonthly,
};
