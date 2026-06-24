function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesBetween(startTime, endTime) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (end <= start) return 0;
  return end - start;
}

/** Fractional minutes from date+startTime to now (for live home tick). */
function minutesFromStart(dateStr, startTime, now = new Date()) {
  const [y, mo, d] = String(dateStr).split('-').map(Number);
  const [h, m] = String(startTime).split(':').map(Number);
  const start = new Date(y, mo - 1, d, h, m || 0, 0, 0);
  const diff = now.getTime() - start.getTime();
  return diff > 0 ? diff / 60000 : 0;
}

function calcBaseHourly(netMonthly, workDaysPerMonth, standardHoursPerDay) {
  const days = Number(workDaysPerMonth) || 21.75;
  const hours = Number(standardHoursPerDay) || 8;
  const denominator = days * hours;
  if (denominator <= 0) return 0;
  return Number(netMonthly) / denominator;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  parseTimeToMinutes,
  minutesBetween,
  minutesFromStart,
  calcBaseHourly,
  roundMoney,
};
