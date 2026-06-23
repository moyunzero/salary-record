const { SETTINGS_KEY } = require('../constants/storage-keys');
const { DEFAULT_INSURANCE } = require('../core/insurance');
const { defaultWorkSchedule, computeDailyWorkHours } = require('../core/work-schedule');

function defaultSettings() {
  return {
    monthlySalary: 0,
    workDaysPerMonth: 21.75,
    standardHoursPerDay: 8,
    insurance: { ...DEFAULT_INSURANCE },
    workStartTime: '09:00',
    cloudSyncEnabled: false,
    onboardingDone: false,
  };
}

function migrateSettings(stored) {
  if (stored.workSchedule) return stored;
  const workSchedule = defaultWorkSchedule(stored.workStartTime || '09:00');
  return {
    ...stored,
    workSchedule,
    nightShiftEnabled: false,
    standardHoursPerDay:
      stored.standardHoursPerDay ?? computeDailyWorkHours(workSchedule, false),
  };
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
