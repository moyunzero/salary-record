const { SETTINGS_KEY } = require('../constants/storage-keys');
const { DEFAULT_INSURANCE } = require('../core/insurance');
const { defaultWorkSchedule, computeDailyWorkHours } = require('../core/work-schedule');

const DEFAULT_WORK_WEEKDAYS = [1, 2, 3, 4, 5];

function defaultSettings() {
  return {
    monthlySalary: 0,
    workDaysPerMonth: 21.75,
    standardHoursPerDay: 8,
    insurance: { ...DEFAULT_INSURANCE },
    workStartTime: '09:00',
    workWeekdays: [...DEFAULT_WORK_WEEKDAYS],
    autoStartEnabled: true,
    restSystem: 'double_rest',
    bigSmall: { anchorWeekDate: '', anchorType: 'big' },
    holidayAutoRest: true,
    compLeaveBalance: 0,
    cloudSyncEnabled: false,
    onboardingDone: false,
  };
}

function migrateSettings(stored) {
  let next = stored;
  if (!stored.workSchedule) {
    const workSchedule = defaultWorkSchedule(stored.workStartTime || '09:00');
    next = {
      ...next,
      workSchedule,
      nightShiftEnabled: false,
      standardHoursPerDay:
        stored.standardHoursPerDay ?? computeDailyWorkHours(workSchedule, false),
    };
  }
  // 0=周日 … 6=周六。缺省补周一~周五，保证老用户也有「工作日」概念。
  if (!Array.isArray(next.workWeekdays)) {
    next = { ...next, workWeekdays: [...DEFAULT_WORK_WEEKDAYS] };
  }
  if (typeof next.autoStartEnabled !== 'boolean') {
    next = { ...next, autoStartEnabled: true };
  }
  // 工作制 / 节假日相关字段补全
  if (!next.restSystem) {
    next = { ...next, restSystem: 'double_rest' };
  }
  if (!next.bigSmall || typeof next.bigSmall !== 'object') {
    next = { ...next, bigSmall: { anchorWeekDate: '', anchorType: 'big' } };
  }
  if (typeof next.holidayAutoRest !== 'boolean') {
    next = { ...next, holidayAutoRest: true };
  }
  if (typeof next.compLeaveBalance !== 'number') {
    next = { ...next, compLeaveBalance: 0 };
  }
  return next;
}

function getSettings() {
  const stored = wx.getStorageSync(SETTINGS_KEY);
  return migrateSettings({ ...defaultSettings(), ...(stored || {}) });
}

function saveSettings(partial, options = {}) {
  const keys = Object.keys(partial || {});
  const onlyCloudFlag = keys.length === 1 && keys[0] === 'cloudSyncEnabled';
  const next = { ...getSettings(), ...partial };
  if (!onlyCloudFlag) {
    next.updatedAt = Date.now();
  }
  wx.setStorageSync(SETTINGS_KEY, next);
  if (!options.skipSchedule && !onlyCloudFlag) {
    try {
      require('./sync').scheduleSync();
    } catch (_) {}
  }
  return next;
}

function isOnboardingDone() {
  return Boolean(getSettings().onboardingDone);
}

module.exports = {
  defaultSettings,
  migrateSettings,
  getSettings,
  saveSettings,
  isOnboardingDone,
};
