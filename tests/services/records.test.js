const assert = require('assert');
const { buildRecordSnapshot } = require('../../miniprogram/core/dilution');

const settings = {
  monthlySalary: 15000,
  workDaysPerMonth: 21.75,
  standardHoursPerDay: 8,
  insurance: { pension: 0.08, medical: 0.02, unemployment: 0.005, fund: 0.12 },
  workSchedule: {
    morning: { start: '09:00', end: '12:00' },
    lunch: { start: '12:00', end: '13:00' },
    afternoon: { start: '13:00', end: '18:00' },
  },
};

const storage = {
  xsb_settings: settings,
};
global.wx = {
  getStorageSync: (key) => storage[key] || (key === 'xsb_records' ? [] : undefined),
  setStorageSync: (key, val) => {
    storage[key] = val;
  },
  removeStorageSync: (key) => {
    delete storage[key];
  },
};

const {
  validateRecordTimes,
  buildRecordEditView,
  upsertManualRecord,
  deleteRecord,
  getRecords,
  getAllRecordsIncludingTombstones,
} = require('../../miniprogram/services/clock');

assert.strictEqual(validateRecordTimes('09:00', '09:00'), false);
assert.strictEqual(validateRecordTimes('09:00', '17:00'), true);

const view8 = buildRecordEditView(settings, '09:00', '17:00');
assert.strictEqual(view8.valid, true);
assert.strictEqual(view8.inOvertime, false);
assert.strictEqual(view8.dilutionDisplay, 0);

const view10 = buildRecordEditView(settings, '09:00', '19:00');
assert.strictEqual(view10.inOvertime, true);
assert.ok(view10.dilutionDisplay > 0);
assert.strictEqual(view10.overtimeDuration, '1h', '扣午休后 9h 计薪 → 白加 1h');

const viewFullDay = buildRecordEditView(settings, '09:00', '18:00');
assert.strictEqual(viewFullDay.inOvertime, false, '09-18 扣午休后刚好 8h，不应显示白加');
assert.strictEqual(viewFullDay.dilutionDisplay, 0);

const viewEarlyLate = buildRecordEditView(settings, '08:00', '18:00');
assert.strictEqual(viewEarlyLate.inOvertime, false, '早到按锚点 09:00 计薪，与 09-18 一致');
assert.strictEqual(viewEarlyLate.earned, viewFullDay.earned);

const snap = buildRecordSnapshot(settings, '09:00', '19:00');
assert.strictEqual(view10.earned, snap.earned.toFixed(2));

const bad = upsertManualRecord({
  date: '2026-06-22',
  startTime: '09:00',
  endTime: '08:00',
});
assert.strictEqual(bad.ok, false);
assert.strictEqual(bad.error, 'END_BEFORE_START');

const future = upsertManualRecord({
  date: '2099-12-31',
  startTime: '09:00',
  endTime: '18:00',
});
assert.strictEqual(future.ok, false);
assert.strictEqual(future.error, 'FUTURE_DATE');

const good = upsertManualRecord({
  date: '2026-06-22',
  startTime: '09:00',
  endTime: '17:00',
});
assert.strictEqual(good.ok, true);
assert.ok(good.record.earned > 0);
assert.ok(good.record.effectiveHourly > 0);
assert.ok(typeof good.record.dilutionPct === 'number');

assert.strictEqual(getRecords().length, 1);
assert.strictEqual(deleteRecord(good.record.id), true);
assert.strictEqual(getRecords().length, 0);
const all = getAllRecordsIncludingTombstones();
assert.strictEqual(all.length, 1);
assert.strictEqual(all[0].deleted, true);

// 晚到补录：预览与保存均按排班锚点计薪，金额一致
const viewLate = buildRecordEditView(settings, '10:00', '18:00');
const viewOnTime = buildRecordEditView(settings, '09:00', '18:00');
assert.strictEqual(viewLate.earned, viewOnTime.earned, '工作日晚到预览按锚点计薪');
const savedLate = upsertManualRecord({
  date: '2026-06-23',
  startTime: '10:00',
  endTime: '18:00',
});
assert.strictEqual(savedLate.ok, true);
assert.strictEqual(savedLate.record.earned.toFixed(2), viewLate.earned);

// 调休余额：补录勾选/取消/删除
const { getSettings, saveSettings } = require('../../miniprogram/services/settings');
saveSettings({ compLeaveBalance: 0 });
const holidayMap = require('../../miniprogram/assets/holidays/CN-2026.js');
const compSaved = upsertManualRecord({
  date: '2026-06-21',
  startTime: '09:00',
  endTime: '12:00',
  compLeave: true,
});
assert.strictEqual(compSaved.ok, true);
assert.strictEqual(getSettings().compLeaveBalance, 1);
assert.strictEqual(deleteRecord(compSaved.record.id), true);
assert.strictEqual(getSettings().compLeaveBalance, 0);

console.log('records.test.js: ok');
