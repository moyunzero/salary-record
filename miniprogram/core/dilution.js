const { calcNetMonthly } = require('./insurance');
const { minutesBetween, calcBaseHourly, roundMoney, parseTimeToMinutes } = require('./salary');
const { restWindows, restOverlapMinutes } = require('./work-schedule');

/**
 * 计薪工时 = 区间总分钟 − 与午休/晚休的重叠分钟（午休不计薪）。
 * 当 settings 缺少 workSchedule 时退化为原始时长，保持向后兼容。
 * @param {object} settings 用户设置（含 workSchedule、nightShiftEnabled）
 * @param {string} startTime HH:MM
 * @param {string} endTime HH:MM
 * @returns {number} 计薪分钟数，恒 >= 0
 */
function workedMinutesBetween(settings, startTime, endTime) {
  const elapsed = minutesBetween(startTime, endTime);
  if (elapsed <= 0) return 0;
  const schedule = settings && settings.workSchedule;
  if (!schedule) return elapsed;
  const windows = restWindows(schedule, !!settings.nightShiftEnabled);
  const startMin = parseTimeToMinutes(startTime);
  const rest = restOverlapMinutes(startMin, startMin + elapsed, windows);
  return Math.max(0, elapsed - rest);
}

function calcEarnedFromMinutes(settings, elapsedMinutes) {
  const netMonthly = calcNetMonthly(settings.monthlySalary, settings.insurance);
  const workDays = settings.workDaysPerMonth ?? 21.75;
  const standardHours = settings.standardHoursPerDay ?? 8;
  const baseHourly = calcBaseHourly(netMonthly, workDays, standardHours);

  if (elapsedMinutes <= 0 || baseHourly <= 0) return 0;

  const standardMinutes = standardHours * 60;
  const elapsedHours = elapsedMinutes / 60;

  if (elapsedMinutes <= standardMinutes) {
    return roundMoney(baseHourly * elapsedHours);
  }

  return roundMoney(baseHourly * standardHours);
}

function calcEarned(settings, startTime, endTime) {
  return calcEarnedFromMinutes(settings, minutesBetween(startTime, endTime));
}

function calcEffectiveHourly(earned, elapsedMinutes) {
  if (!elapsedMinutes || elapsedMinutes <= 0) return 0;
  return roundMoney(earned / (elapsedMinutes / 60));
}

function calcDilutionPct(effectiveHourly, baseHourly) {
  if (!baseHourly || baseHourly <= 0) return 0;
  const pct = 1 - effectiveHourly / baseHourly;
  return roundMoney(Math.max(0, Math.min(1, pct)));
}

function buildRecordSnapshot(settings, startTime, endTime) {
  const netMonthly = calcNetMonthly(settings.monthlySalary, settings.insurance);
  const workDays = settings.workDaysPerMonth ?? 21.75;
  const standardHours = settings.standardHoursPerDay ?? 8;
  const baseHourly = calcBaseHourly(netMonthly, workDays, standardHours);
  const workedMinutes = workedMinutesBetween(settings, startTime, endTime);
  const earned = calcEarnedFromMinutes(settings, workedMinutes);
  const effectiveHourly = calcEffectiveHourly(earned, workedMinutes);
  const dilutionPct = calcDilutionPct(effectiveHourly, baseHourly);

  return { earned, effectiveHourly, dilutionPct };
}

function buildLiveSnapshot(settings, elapsedMinutes) {
  const netMonthly = calcNetMonthly(settings.monthlySalary, settings.insurance);
  const workDays = settings.workDaysPerMonth ?? 21.75;
  const standardHours = settings.standardHoursPerDay ?? 8;
  const baseHourly = calcBaseHourly(netMonthly, workDays, standardHours);
  const earned = calcEarnedFromMinutes(settings, elapsedMinutes);
  const effectiveHourly = calcEffectiveHourly(earned, elapsedMinutes);
  const dilutionPct = calcDilutionPct(effectiveHourly, baseHourly);
  return { earned, effectiveHourly, dilutionPct };
}

module.exports = {
  calcEarned,
  calcEarnedFromMinutes,
  calcEffectiveHourly,
  calcDilutionPct,
  workedMinutesBetween,
  buildRecordSnapshot,
  buildLiveSnapshot,
};
