const assert = require('assert');
const { buildRecordSnapshot } = require('../../miniprogram/core/dilution');

const settings = {
  monthlySalary: 15000,
  workDaysPerMonth: 21.75,
  standardHoursPerDay: 8,
  insurance: { pension: 0.08, medical: 0.02, unemployment: 0.005, fund: 0.12 },
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

const snap = buildRecordSnapshot(settings, '09:00', '19:00');
assert.strictEqual(view10.earned, snap.earned.toFixed(2));

const bad = upsertManualRecord({
  date: '2026-06-22',
  startTime: '09:00',
  endTime: '08:00',
});
assert.strictEqual(bad.ok, false);
assert.strictEqual(bad.error, 'END_BEFORE_START');

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

console.log('records.test.js: ok');
