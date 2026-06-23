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

module.exports = {
  computeDailyWorkHours,
  validateWorkSchedule,
  resolveSegment,
  getLastWorkBlockEnd,
  defaultWorkSchedule,
};
