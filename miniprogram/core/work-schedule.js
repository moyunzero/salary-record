const { parseTimeToMinutes, minutesBetween } = require('./salary');

function defaultWorkSchedule(workStartTime = '09:00') {
  return {
    morning: { start: workStartTime, end: '12:00' },
    lunch: { start: '12:00', end: '13:00' },
    afternoon: { start: '13:00', end: '18:00' },
    eveningRest: { start: '18:00', end: '19:00' },
    nightWork: { start: '19:00', end: '22:00' },
  };
}

function computeDailyWorkHours(schedule, nightShiftEnabled) {
  const blocks = [schedule.morning, schedule.afternoon];
  if (nightShiftEnabled) blocks.push(schedule.nightWork);
  return blocks.reduce((h, b) => h + minutesBetween(b.start, b.end) / 60, 0);
}

function isValidTimeStr(timeStr) {
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

function blockMinutes(block) {
  if (!block || !isValidTimeStr(block.start) || !isValidTimeStr(block.end)) {
    return null;
  }
  const start = parseTimeToMinutes(block.start);
  const end = parseTimeToMinutes(block.end);
  if (end <= start) return null;
  return { start, end };
}

function validateWorkSchedule(schedule, nightShiftEnabled) {
  if (!schedule || !schedule.morning || !schedule.lunch || !schedule.afternoon) {
    return { ok: false, error: 'invalid_schedule' };
  }

  const morning = blockMinutes(schedule.morning);
  const lunch = blockMinutes(schedule.lunch);
  const afternoon = blockMinutes(schedule.afternoon);
  if (!morning || !lunch || !afternoon) {
    return { ok: false, error: 'invalid_block' };
  }

  if (morning.end > lunch.start) {
    return { ok: false, error: 'overlap' };
  }
  if (lunch.end > afternoon.start) {
    return { ok: false, error: 'overlap' };
  }

  if (nightShiftEnabled) {
    const eveningRest = blockMinutes(schedule.eveningRest);
    const nightWork = blockMinutes(schedule.nightWork);
    if (!eveningRest || !nightWork) {
      return { ok: false, error: 'invalid_block' };
    }
    if (afternoon.end > eveningRest.start) {
      return { ok: false, error: 'overlap' };
    }
    if (eveningRest.end > nightWork.start) {
      return { ok: false, error: 'overlap' };
    }
  }

  const hours = computeDailyWorkHours(schedule, nightShiftEnabled);
  if (hours < 4 || hours > 16) {
    return { ok: false, error: 'hours_out_of_range', hours };
  }

  return { ok: true, hours };
}

function minutesFromNow(now) {
  if (typeof now === 'number') return now;
  if (typeof now === 'string') return parseTimeToMinutes(now);
  return now.getHours() * 60 + now.getMinutes();
}

function inSegment(minutes, block) {
  const b = blockMinutes(block);
  if (!b) return false;
  return minutes >= b.start && minutes < b.end;
}

function resolveSegment(now, schedule, nightShiftEnabled) {
  const minutes = minutesFromNow(now);
  if (inSegment(minutes, schedule.morning)) return 'morning';
  if (inSegment(minutes, schedule.lunch)) return 'lunch';
  if (inSegment(minutes, schedule.afternoon)) return 'afternoon';
  if (nightShiftEnabled) {
    if (inSegment(minutes, schedule.eveningRest)) return 'eveningRest';
    if (inSegment(minutes, schedule.nightWork)) return 'nightWork';
  }
  return null;
}

function getLastWorkBlockEnd(schedule, nightShiftEnabled) {
  const endTime = nightShiftEnabled ? schedule.nightWork.end : schedule.afternoon.end;
  return parseTimeToMinutes(endTime);
}

/**
 * 不计薪的休息段定义。lunch 始终生效，eveningRest 仅夜班启用时生效。
 * @type {Array<{ key: string, label: string, nightOnly: boolean }>}
 */
const REST_BLOCK_DEFS = [
  { key: 'lunch', label: '午休', nightOnly: false },
  { key: 'eveningRest', label: '晚休', nightOnly: true },
];

/**
 * 解析出当日所有「不计薪」的休息窗口（以分钟为单位，含中文标签）。
 * @param {object} schedule 作息表
 * @param {boolean} nightShiftEnabled 是否启用夜班
 * @returns {Array<{ start: number, end: number, label: string, key: string }>}
 */
function restWindows(schedule, nightShiftEnabled) {
  if (!schedule) return [];
  const windows = [];
  for (const def of REST_BLOCK_DEFS) {
    if (def.nightOnly && !nightShiftEnabled) continue;
    const b = blockMinutes(schedule[def.key]);
    if (b) windows.push({ start: b.start, end: b.end, label: def.label, key: def.key });
  }
  return windows;
}

/**
 * 计算 [rangeStart, rangeEnd] 与休息窗口的重叠分钟数（用于从工时中扣除午休/晚休）。
 * @param {number} rangeStart 起点（当日分钟）
 * @param {number} rangeEnd 终点（当日分钟，可为小数）
 * @param {Array<{ start: number, end: number }>} windows 休息窗口
 * @returns {number} 重叠分钟数，恒 >= 0
 */
function restOverlapMinutes(rangeStart, rangeEnd, windows) {
  if (!(rangeEnd > rangeStart) || !windows || !windows.length) return 0;
  let total = 0;
  for (const w of windows) {
    const lo = Math.max(rangeStart, w.start);
    const hi = Math.min(rangeEnd, w.end);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

/**
 * 返回当前时刻所处的休息窗口；不在任何休息段内时返回 null。
 * @param {number} minutes 当日分钟（可为小数）
 * @param {Array<{ start: number, end: number, label: string, key: string }>} windows 休息窗口
 * @returns {{ start: number, end: number, label: string, key: string } | null}
 */
function currentRestWindow(minutes, windows) {
  if (!windows || !windows.length) return null;
  for (const w of windows) {
    if (minutes >= w.start && minutes < w.end) return w;
  }
  return null;
}

module.exports = {
  computeDailyWorkHours,
  validateWorkSchedule,
  resolveSegment,
  getLastWorkBlockEnd,
  defaultWorkSchedule,
  restWindows,
  restOverlapMinutes,
  currentRestWindow,
};
