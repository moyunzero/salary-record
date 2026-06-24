const {
  resolveSegment,
  getLastWorkBlockEnd,
  defaultWorkSchedule,
} = require('./work-schedule');
const { parseTimeToMinutes } = require('./salary');

const WALL_L3_MINUTES = 23 * 60;

function minutesFromNow(now) {
  if (typeof now === 'number') return now;
  return now.getHours() * 60 + now.getMinutes();
}

function getSchedule(settings) {
  return settings && settings.workSchedule
    ? settings.workSchedule
    : defaultWorkSchedule(settings && settings.workStartTime);
}

function isWorkSegment(segment) {
  return segment === 'morning' || segment === 'afternoon' || segment === 'nightWork';
}

function computeEscalation(nowMinutes, lastEndMinutes, options = {}) {
  if (nowMinutes <= lastEndMinutes) return 0;

  const minutesPast = nowMinutes - lastEndMinutes;
  const inL3 = minutesPast > 120 || nowMinutes >= WALL_L3_MINUTES;

  if (inL3) {
    if (options.l3EnteredAt) {
      const enteredMinutes = minutesFromNow(options.l3EnteredAt);
      if (nowMinutes - enteredMinutes >= 10) return 4;
    }
    return 3;
  }
  if (minutesPast >= 60) return 2;
  return 1;
}

function resolvePetContext(appState, now, settings, options = {}) {
  if (appState === 'done') {
    return { context: 'done', escalation: 0 };
  }

  const schedule = getSchedule(settings);
  const nightShiftEnabled = !!(settings && settings.nightShiftEnabled);
  const segment = resolveSegment(now, schedule, nightShiftEnabled);
  const nowMinutes = minutesFromNow(now);

  if (appState === 'working') {
    if (!segment) {
      const lastEnd = getLastWorkBlockEnd(schedule, nightShiftEnabled);
      return {
        context: 'overtime',
        escalation: computeEscalation(nowMinutes, lastEnd, options),
      };
    }

    if (segment === 'lunch') {
      return { context: 'lunch', escalation: 0 };
    }

    if (segment === 'nightWork') {
      return { context: 'nightShift', escalation: 0 };
    }

    if (segment === 'morning' || segment === 'afternoon') {
      return { context: 'onShift', escalation: 0 };
    }

    const lastEnd = getLastWorkBlockEnd(schedule, nightShiftEnabled);
    return {
      context: 'overtime',
      escalation: computeEscalation(nowMinutes, lastEnd, options),
    };
  }

  if (segment === 'lunch') {
    return { context: 'lunch', escalation: 0 };
  }

  if (nightShiftEnabled && segment === 'eveningRest' && appState === 'idle') {
    return { context: 'dinner', escalation: 0 };
  }

  const morningStart = schedule.morning && schedule.morning.start;
  if (morningStart && nowMinutes < parseTimeToMinutes(morningStart)) {
    return { context: 'beforeWork', escalation: 0 };
  }

  if (
    segment === 'morning' ||
    segment === 'afternoon' ||
    segment === 'nightWork' ||
    segment == null
  ) {
    return { context: 'offDuty', escalation: 0 };
  }

  return { context: 'offDuty', escalation: 0 };
}

module.exports = {
  resolvePetContext,
};
