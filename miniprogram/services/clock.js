const { RECORDS_KEY, DEV_MOCK_OVERTIME_KEY, DEV_MOCK_OVERTIME_OFFSET_KEY } = require('../constants/storage-keys');
const { isDevelopEnv } = require('../utils/env');
const { getSettings, saveSettings } = require('./settings');
const { buildRecordSnapshot, buildLiveSnapshot } = require('../core/dilution');
const { calcNetMonthly } = require('../core/insurance');
const {
  calcBaseHourly,
  roundMoney,
  minutesBetween,
  parseTimeToMinutes,
} = require('../core/salary');
const {
  defaultWorkSchedule,
  restWindows,
  restOverlapMinutes,
  currentRestWindow,
  getLastWorkBlockEnd,
} = require('../core/work-schedule');
const {
  DAY_TYPE,
  resolveDayType,
  isWorkingDayType,
  premiumMultiplierFor,
} = require('../core/work-calendar');
const { getHolidayMapForYears } = require('./holidays');

const REST_RING_COLOR = '#2dd4bf';
const HOLIDAY_RING_COLOR = '#fbbf24'; // 法定节假日：节日金
const WEEKEND_RING_COLOR = '#60a5fa'; // 普通休息日：静谧蓝

/** 取当前年份±次年的合并节假日表（覆盖年底查次年场景）。 */
function holidayMapAround(now = new Date()) {
  const y = now.getFullYear();
  return getHolidayMapForYears([y, y + 1]);
}

function formatMinutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  return `${pad2(h)}:${pad2(m)}`;
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

function resolveSchedule(settings) {
  return settings.workSchedule || defaultWorkSchedule(settings.workStartTime);
}

/** 计薪锚点：预设上班时间（排班起点）。月薪固定下早到/晚到不影响当天工资。 */
function scheduleAnchorStart(settings) {
  return resolveSchedule(settings).morning.start;
}

function computeBaseHourly(settings) {
  return calcBaseHourly(
    calcNetMonthly(settings.monthlySalary, settings.insurance),
    settings.workDaysPerMonth,
    settings.standardHoursPerDay
  );
}

/** 节假日/休息日上班的计薪工时：实际打卡区间扣除午休/晚休（不锚定排班）。 */
function premiumWorkedMinutes(settings, startTime, endTime) {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  const elapsed = Math.max(0, endMin - startMin);
  const wins = restWindows(resolveSchedule(settings), !!settings.nightShiftEnabled);
  return Math.max(0, elapsed - restOverlapMinutes(startMin, endMin, wins));
}

/**
 * 收工/补录结算快照（按日类型分流）：
 * 工作日 → 月薪摊（锚定排班，含稀释）；法定节假日/休息日 → 倍数加班费或调休不计薪。
 */
function buildDaySnapshot(settings, record, endTime, holidayMap) {
  const dayType = resolveDayType(record.date, settings, holidayMap);
  const multiplier = premiumMultiplierFor(dayType);
  if (multiplier > 1) {
    const baseHourly = computeBaseHourly(settings);
    const worked = premiumWorkedMinutes(settings, record.startTime, endTime);
    const compLeave = !!record.compLeave;
    const earned = compLeave ? 0 : roundMoney((baseHourly * worked) / 60 * multiplier);
    return {
      earned,
      effectiveHourly: roundMoney(baseHourly * multiplier),
      dilutionPct: 0,
      dayType,
      premiumMultiplier: multiplier,
      compLeave,
    };
  }
  const snap = buildRecordSnapshot(settings, scheduleAnchorStart(settings), endTime);
  return { ...snap, dayType, premiumMultiplier: 1, compLeave: false };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowTimeStr(d = new Date()) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function getAllRecordsIncludingTombstones() {
  const raw = wx.getStorageSync(RECORDS_KEY);
  return Array.isArray(raw) ? raw : [];
}

function getRecords() {
  return getAllRecordsIncludingTombstones().filter((r) => !r.deleted);
}

function saveRecords(records, options = {}) {
  wx.setStorageSync(RECORDS_KEY, records);
  if (!options.skipSchedule) {
    try {
      require('./sync').scheduleSync();
    } catch (_) {}
  }
}

function applyRecordsForSync(records) {
  saveRecords(records, { skipSchedule: true });
}

function getTodayRecord() {
  const today = todayStr();
  return getRecords().find((r) => r.date === today) || null;
}

function getTodayState() {
  const rec = getTodayRecord();
  if (!rec) return 'idle';
  if (!rec.endTime) return 'working';
  return 'done';
}

function startWork(options = {}) {
  const today = todayStr();
  const records = getAllRecordsIncludingTombstones();
  const existing = records.find((r) => r.date === today && !r.deleted);
  if (existing?.endTime) return existing;

  const record = {
    id: existing?.id || `rec_${Date.now()}`,
    date: today,
    startTime: existing?.startTime || nowTimeStr(),
    endTime: null,
    ...(options.dayType ? { dayType: options.dayType } : {}),
    ...(options.compLeave !== undefined ? { compLeave: !!options.compLeave } : {}),
    updatedAt: Date.now(),
    syncedAt: null,
  };

  const next = existing
    ? records.map((r) => (r.date === today ? { ...r, ...record } : r))
    : [...records, record];
  saveRecords(next);
  return record;
}

/**
 * 工作日到点自动开始：在「工作日 + 处于排班工作时段 + 今日尚无任何记录」时，
 * 以排班起点为 startTime 自动创建上班记录。删除当天记录视为「今天休息」，不会重复创建。
 * @param {Date} now
 * @returns {object|null} 新建的记录；不满足条件返回 null
 */
function autoStartWorkIfDue(now = new Date()) {
  const settings = getSettings();
  if (!settings.autoStartEnabled) return null;

  const today = todayStr(now);
  const records = getAllRecordsIncludingTombstones();
  if (records.some((r) => r.date === today)) return null;

  // 仅工作日/调休补班日自动开始；休息日、法定节假日需用户手动「今天要上班」。
  const dayType = resolveDayType(today, settings, holidayMapAround(now));
  if (!isWorkingDayType(dayType)) return null;

  const schedule = resolveSchedule(settings);
  const startMin = parseTimeToMinutes(schedule.morning.start);
  const endMin = getLastWorkBlockEnd(schedule, !!settings.nightShiftEnabled);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < startMin || nowMin >= endMin) return null;

  const record = {
    id: `rec_${Date.now()}`,
    date: today,
    startTime: schedule.morning.start,
    endTime: null,
    autoStarted: true,
    dayType,
    updatedAt: Date.now(),
    syncedAt: null,
  };
  saveRecords([...records, record]);
  return record;
}

function findUnfinishedPriorRecord(now = new Date()) {
  const today = todayStr(now);
  return getRecords().find((r) => r.date < today && !r.endTime) || null;
}

function seedDevCrossDayRecord(now = new Date()) {
  if (!isDevelopEnv()) return null;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const date = todayStr(yesterday);
  const records = getAllRecordsIncludingTombstones().filter((r) => r.date !== date);
  const orphan = {
    id: `rec_dev_${date}`,
    date,
    startTime: '09:00',
    endTime: null,
  };
  saveRecords([...records, orphan]);
  return orphan;
}

function closeRecordAt(record, endTime = '23:59') {
  if (!record) return null;
  const settings = getSettings();
  const recordDate = record.date ? new Date(`${record.date}T00:00:00`) : new Date();
  const snap = buildDaySnapshot(settings, record, endTime, holidayMapAround(recordDate));
  const updated = {
    ...record,
    endTime,
    earned: snap.earned,
    effectiveHourly: snap.effectiveHourly,
    dilutionPct: snap.dilutionPct,
    dayType: snap.dayType,
    premiumMultiplier: snap.premiumMultiplier,
    compLeave: snap.compLeave,
    updatedAt: Date.now(),
    syncedAt: null,
  };
  const records = getAllRecordsIncludingTombstones();
  saveRecords(records.map((r) => (r.id === record.id ? updated : r)));
  return updated;
}

function clockOut() {
  const settings = getSettings();
  const today = todayStr();
  const endTime = nowTimeStr();
  const records = getAllRecordsIncludingTombstones();
  const rec = records.find((r) => r.date === today && !r.deleted);
  if (!rec || rec.endTime) return null;

  const snap = buildDaySnapshot(settings, rec, endTime, holidayMapAround());
  const updated = {
    ...rec,
    endTime,
    earned: snap.earned,
    effectiveHourly: snap.effectiveHourly,
    dilutionPct: snap.dilutionPct,
    dayType: snap.dayType,
    premiumMultiplier: snap.premiumMultiplier,
    compLeave: snap.compLeave,
    updatedAt: Date.now(),
    syncedAt: null,
  };
  saveRecords(records.map((r) => (r.date === today ? updated : r)));
  // 调休：工作在节假日/休息日且选择调休 → 调休余额 +1
  if (snap.premiumMultiplier > 1 && snap.compLeave) {
    const s = getSettings();
    saveSettings({ compLeaveBalance: (s.compLeaveBalance || 0) + 1 });
  }
  return updated;
}

function parseRecordStart(record) {
  const [y, m, d] = record.date.split('-').map(Number);
  const [h, min] = record.startTime.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0);
}

function formatOvertimeLabel(overtimeMinutes) {
  const rounded = Math.round(overtimeMinutes);
  if (rounded < 60) return `+${rounded}分`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `+${h}h${m}m` : `+${h}h`;
}

function formatOvertimeDuration(overtimeMinutes) {
  const rounded = Math.round(overtimeMinutes);
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function mockOvertimeOffsetMs(record, settings, realNow = Date.now()) {
  const standardMinutes = (settings.standardHoursPerDay || 8) * 60;
  const startMin = parseTimeToMinutes(record.startTime);
  const schedule = settings.workSchedule || defaultWorkSchedule(settings.workStartTime);
  const windows = restWindows(schedule, !!settings.nightShiftEnabled);
  // 午休/晚休不计薪，需把当日全部休息时长加进墙钟目标，才能真正进入「+60分钟加班」。
  const restTotal = restOverlapMinutes(startMin, startMin + 24 * 60, windows);
  const realElapsed = (realNow - parseRecordStart(record).getTime()) / 60000;
  const targetElapsed = standardMinutes + 60 + restTotal;
  return Math.max(0, (targetElapsed - realElapsed) * 60 * 1000);
}

function computeMockOvertimeNow(record, settings, realNow) {
  if (record && settings && realNow !== undefined) {
    return new Date(realNow + mockOvertimeOffsetMs(record, settings, realNow));
  }
  const offsetMs = wx.getStorageSync(DEV_MOCK_OVERTIME_OFFSET_KEY) || 0;
  return new Date(Date.now() + offsetMs);
}

function isDevMockOvertime() {
  if (!isDevelopEnv()) return false;
  return !!wx.getStorageSync(DEV_MOCK_OVERTIME_KEY);
}

function toggleDevMockOvertime() {
  if (!isDevelopEnv()) return false;
  const next = !isDevMockOvertime();
  if (next) {
    const record = getTodayRecord();
    const settings = getSettings();
    if (record && !record.endTime) {
      wx.setStorageSync(DEV_MOCK_OVERTIME_OFFSET_KEY, mockOvertimeOffsetMs(record, settings));
    }
  } else {
    wx.removeStorageSync(DEV_MOCK_OVERTIME_OFFSET_KEY);
  }
  wx.setStorageSync(DEV_MOCK_OVERTIME_KEY, next);
  return next;
}

function dilutionColor(pct) {
  if (pct < 0.1) return '#22c55e';
  if (pct < 0.3) return '#eab308';
  return '#ef4444';
}

function validateRecordTimes(startTime, endTime) {
  return minutesBetween(startTime, endTime) > 0;
}

function getRecordByDate(date) {
  return getRecords().find((r) => r.date === date) || null;
}

function buildRecordEditView(settings, startTime, endTime, options = {}) {
  const standardMinutes = (settings.standardHoursPerDay || 8) * 60;
  const elapsed = minutesBetween(startTime, endTime);
  const date = options.date || null;
  const holidayMap = options.holidayMap || null;
  const dayType = date ? resolveDayType(date, settings, holidayMap) : DAY_TYPE.WORKDAY;
  const premiumMultiplier = premiumMultiplierFor(dayType);
  const isPremiumDay = premiumMultiplier > 1;
  const holidayName = (holidayMap && date && holidayMap[date] && holidayMap[date].name) || '';
  const restDayKind = dayType === DAY_TYPE.STATUTORY_HOLIDAY ? 'holiday' : 'weekend';
  const meta = { dayType, premiumMultiplier, isPremiumDay, holidayName, restDayKind };

  if (elapsed <= 0) {
    return {
      valid: false,
      earned: '0.00',
      effectiveHourly: '0.00',
      dilutionDisplay: 0,
      hourlyColor: '#22c55e',
      inOvertime: false,
      overtimeDuration: '',
      compLeave: !!options.compLeave,
      ...meta,
    };
  }

  // 法定节假日/休息日：按倍数计加班费（或调休不计薪），不走稀释。
  if (isPremiumDay) {
    const baseHourly = computeBaseHourly(settings);
    const worked = premiumWorkedMinutes(settings, startTime, endTime);
    const compLeave = !!options.compLeave;
    const earned = compLeave ? 0 : roundMoney((baseHourly * worked) / 60 * premiumMultiplier);
    return {
      valid: true,
      earned: roundMoney(earned).toFixed(2),
      effectiveHourly: roundMoney(baseHourly * premiumMultiplier).toFixed(2),
      dilutionDisplay: 0,
      hourlyColor: '#22c55e',
      inOvertime: false,
      overtimeDuration: '',
      compLeave,
      ...meta,
    };
  }

  const snap = buildRecordSnapshot(settings, startTime, endTime);
  const inOvertime = elapsed > standardMinutes;
  const overtimeMinutes = Math.max(0, elapsed - standardMinutes);
  return {
    valid: true,
    earned: roundMoney(snap.earned).toFixed(2),
    effectiveHourly: roundMoney(snap.effectiveHourly).toFixed(2),
    dilutionDisplay: Math.round(snap.dilutionPct * 100),
    hourlyColor: dilutionColor(snap.dilutionPct),
    inOvertime,
    overtimeDuration: inOvertime ? formatOvertimeDuration(overtimeMinutes) : '',
    compLeave: false,
    ...meta,
  };
}

function upsertManualRecord({ id, date, startTime, endTime, compLeave }) {
  if (!validateRecordTimes(startTime, endTime)) {
    return { ok: false, error: 'END_BEFORE_START' };
  }
  const settings = getSettings();
  const recordDate = date ? new Date(`${date}T00:00:00`) : new Date();
  const snap = buildDaySnapshot(
    settings,
    { date, startTime, compLeave: !!compLeave },
    endTime,
    holidayMapAround(recordDate)
  );
  const records = getAllRecordsIncludingTombstones();
  const existing = records.find((r) => (id && r.id === id) || (r.date === date && !r.deleted));
  const isPremium = snap.premiumMultiplier > 1;
  const record = {
    id: existing?.id || `rec_${Date.now()}`,
    date,
    startTime,
    endTime,
    earned: snap.earned,
    effectiveHourly: snap.effectiveHourly,
    dilutionPct: snap.dilutionPct,
    dayType: snap.dayType,
    premiumMultiplier: snap.premiumMultiplier,
    ...(isPremium ? { compLeave: snap.compLeave } : {}),
    updatedAt: Date.now(),
    syncedAt: null,
  };
  const next = records.filter((r) => r.id !== record.id && r.date !== date);
  saveRecords([...next, record]);
  return { ok: true, record };
}

function deleteRecord(id) {
  if (!id) return false;
  const records = getAllRecordsIncludingTombstones();
  const target = records.find((r) => r.id === id && !r.deleted);
  if (!target) return false;
  const tombstone = {
    ...target,
    deleted: true,
    updatedAt: Date.now(),
    syncedAt: null,
  };
  saveRecords(records.map((r) => (r.id === id ? tombstone : r)));
  return true;
}

function buildHomeView(settings, record, now = new Date(), holidayMap = null) {
  const baseHourly = computeBaseHourly(settings);
  const baseHourlyDisplay = roundMoney(baseHourly).toFixed(2);
  const standardMinutes = (settings.standardHoursPerDay || 8) * 60;
  const schedule = resolveSchedule(settings);
  const restWins = restWindows(schedule, !!settings.nightShiftEnabled);

  const dateStr = record ? record.date : todayStr(now);
  const dayType = resolveDayType(dateStr, settings, holidayMap);
  const premiumMultiplier = premiumMultiplierFor(dayType);
  const isPremiumDay = premiumMultiplier > 1;
  const holidayName = (holidayMap && holidayMap[dateStr] && holidayMap[dateStr].name) || '';
  const restDayKind = dayType === DAY_TYPE.STATUTORY_HOLIDAY ? 'holiday' : 'weekend';
  const dayMeta = { dayType, premiumMultiplier, holidayName, restDayKind, premiumMode: false, compLeave: false };

  // 无记录：工作日→idle（等待开始/自动开始）；休息日或法定节假日→rest（手动「今天要上班」）。
  const state = !record
    ? isPremiumDay
      ? 'rest'
      : 'idle'
    : record.endTime
      ? 'done'
      : 'working';

  const REST_DEFAULTS = { restMode: false, restLabel: '', restEndsAt: '', restCountdown: '' };

  if (state === 'idle' || state === 'rest') {
    return {
      state,
      baseHourly: baseHourlyDisplay,
      earned: '0.00',
      effectiveHourly: baseHourlyDisplay,
      dilutionPct: 0,
      dilutionDisplay: 0,
      ringPct: 0,
      ringDeg: 0,
      ringColor:
        state === 'rest'
          ? dayType === DAY_TYPE.STATUTORY_HOLIDAY
            ? HOLIDAY_RING_COLOR
            : WEEKEND_RING_COLOR
          : '#22c55e',
      hourlyColor: '#22c55e',
      overtimeLabel: '',
      overtimeDuration: '',
      startTime: '',
      endTime: '',
      ...REST_DEFAULTS,
      ...dayMeta,
    };
  }

  const endTime = record.endTime || nowTimeStr(now);

  // 法定节假日 / 休息日上班：按倍数计加班费（或调休不计薪），从实际打卡时间算、扣午休/晚休。
  if (isPremiumDay) {
    const startMin = parseTimeToMinutes(record.startTime);
    const endMin = record.endTime
      ? parseTimeToMinutes(endTime)
      : now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const elapsed = Math.max(0, endMin - startMin);
    const worked = Math.max(0, elapsed - restOverlapMinutes(startMin, endMin, restWins));
    const activeRest = state === 'working' ? currentRestWindow(endMin, restWins) : null;
    const compLeave = !!record.compLeave;
    const premiumEarned = compLeave ? 0 : roundMoney((baseHourly * worked) / 60 * premiumMultiplier);
    const ringPct = Math.min(100, Math.round((worked / standardMinutes) * 100));
    return {
      state,
      baseHourly: baseHourlyDisplay,
      earned: roundMoney(premiumEarned).toFixed(2),
      effectiveHourly: roundMoney(baseHourly * premiumMultiplier).toFixed(2),
      dilutionPct: 0,
      dilutionDisplay: 0,
      ringPct,
      ringDeg: Math.round((ringPct / 100) * 360),
      ringColor: dayType === DAY_TYPE.STATUTORY_HOLIDAY ? HOLIDAY_RING_COLOR : WEEKEND_RING_COLOR,
      hourlyColor: '#22c55e',
      inOvertime: false,
      overtimeLabel: '',
      overtimeDuration: '',
      startTime: record.startTime,
      endTime: record.endTime || '',
      restMode: !!activeRest,
      restLabel: activeRest ? activeRest.label : '',
      restEndsAt: activeRest ? formatMinutesToTime(activeRest.end) : '',
      restCountdown: activeRest ? formatCountdown(Math.max(0, (activeRest.end - endMin) * 60)) : '',
      ...dayMeta,
      premiumMode: true,
      compLeave,
    };
  }

  // 普通工作日：锚定预设上班时间，午休/晚休不计薪，超时走稀释。
  const anchorStartMin = parseTimeToMinutes(schedule.morning.start);
  const nowMin = record.endTime
    ? parseTimeToMinutes(endTime)
    : now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const elapsed = Math.max(0, nowMin - anchorStartMin);
  const restMin = restOverlapMinutes(anchorStartMin, nowMin, restWins);
  const workedMinutes = Math.max(0, elapsed - restMin);

  const activeRest = state === 'working' ? currentRestWindow(nowMin, restWins) : null;
  const restMode = !!activeRest;
  const restLabel = activeRest ? activeRest.label : '';
  const restEndsAt = activeRest ? formatMinutesToTime(activeRest.end) : '';
  const restCountdown = activeRest
    ? formatCountdown(Math.max(0, (activeRest.end - nowMin) * 60))
    : '';

  const snap = record.endTime
    ? buildRecordSnapshot(settings, schedule.morning.start, endTime)
    : buildLiveSnapshot(settings, workedMinutes);
  const ringPct = Math.min(100, Math.round((workedMinutes / standardMinutes) * 100));
  const ringDeg = Math.round((ringPct / 100) * 360);

  const inOvertime = workedMinutes > standardMinutes;
  let effectiveHourly;
  let dilutionPct;
  let hourlyColor;

  if (state === 'done' || inOvertime) {
    effectiveHourly = roundMoney(snap.effectiveHourly).toFixed(2);
    dilutionPct = snap.dilutionPct;
    hourlyColor = dilutionColor(snap.dilutionPct);
  } else {
    effectiveHourly = baseHourlyDisplay;
    dilutionPct = 0;
    hourlyColor = '#22c55e';
  }

  const ringColor = restMode ? REST_RING_COLOR : inOvertime ? '#f97316' : hourlyColor;
  const overtimeMinutes = Math.max(0, workedMinutes - standardMinutes);

  return {
    state,
    baseHourly: baseHourlyDisplay,
    earned: roundMoney(snap.earned).toFixed(2),
    effectiveHourly,
    dilutionPct,
    dilutionDisplay: Math.round(dilutionPct * 100),
    ringPct,
    ringDeg,
    ringColor,
    hourlyColor,
    inOvertime: state === 'working' && !restMode && inOvertime,
    overtimeLabel: overtimeMinutes > 0 ? formatOvertimeLabel(overtimeMinutes) : '',
    overtimeDuration: overtimeMinutes > 0 ? formatOvertimeDuration(overtimeMinutes) : '',
    // 计薪锚定预设上班时间，显示也用锚点，避免「12:50 起 / 已赚含上午」口径不一致。
    startTime: schedule.morning.start,
    endTime: record.endTime || '',
    restMode,
    restLabel,
    restEndsAt,
    restCountdown,
    ...dayMeta,
  };
}

module.exports = {
  todayStr,
  nowTimeStr,
  getRecords,
  getAllRecordsIncludingTombstones,
  applyRecordsForSync,
  getTodayRecord,
  getRecordByDate,
  getTodayState,
  findUnfinishedPriorRecord,
  seedDevCrossDayRecord,
  closeRecordAt,
  startWork,
  autoStartWorkIfDue,
  clockOut,
  buildHomeView,
  buildRecordEditView,
  validateRecordTimes,
  upsertManualRecord,
  deleteRecord,
  dilutionColor,
  computeMockOvertimeNow,
  isDevMockOvertime,
  toggleDevMockOvertime,
};
