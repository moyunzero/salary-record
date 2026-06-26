const assert = require('assert');

// 最小 wx 存储 mock（autoStartWorkIfDue 依赖 getSettings/saveRecords）
const __storage = {};
global.wx = global.wx || {
  getStorageSync: (k) => __storage[k],
  setStorageSync: (k, v) => {
    __storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete __storage[k];
  },
};

const {
  todayStr,
  buildHomeView,
  dilutionColor,
  computeMockOvertimeNow,
  autoStartWorkIfDue,
} = require('../../miniprogram/services/clock');
const { calcNetMonthly } = require('../../miniprogram/core/insurance');
const { calcBaseHourly } = require('../../miniprogram/core/salary');

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
const baseHourly = calcBaseHourly(
  calcNetMonthly(settings.monthlySalary, settings.insurance),
  settings.workDaysPerMonth,
  settings.standardHoursPerDay
);

assert.strictEqual(todayStr(new Date('2026-06-22T15:30:00+08:00')), '2026-06-22');

assert.strictEqual(dilutionColor(0.05), '#22c55e');
assert.strictEqual(dilutionColor(0.15), '#eab308');
assert.strictEqual(dilutionColor(0.35), '#ef4444');

// 工作日（周三）无记录 → idle
const idle = buildHomeView(settings, null, new Date('2026-06-24T10:00:00+08:00'));
assert.strictEqual(idle.state, 'idle');

const workingRecord = { date: '2026-06-22', startTime: '09:00', endTime: null };
const workingNow = new Date('2026-06-22T12:00:00+08:00');
const working = buildHomeView(settings, workingRecord, workingNow);
assert.strictEqual(working.state, 'working');
assert.ok(parseFloat(working.earned) > 0);
assert.ok(working.ringPct > 0 && working.ringPct <= 100);

const overtimeNow = new Date('2026-06-22T20:00:00+08:00');
const overtime = buildHomeView(settings, workingRecord, overtimeNow);
assert.strictEqual(overtime.ringColor, '#f97316');

const tickNow = new Date('2026-06-22T09:00:30+08:00');
const ticking = buildHomeView(settings, workingRecord, tickNow);
assert.ok(parseFloat(ticking.earned) > 0, 'earned should update within first minute');
assert.strictEqual(ticking.effectiveHourly, ticking.baseHourly, 'within standard hours show stable base hourly');
assert.strictEqual(ticking.dilutionDisplay, 0);

assert.ok(overtime.dilutionDisplay > 0, 'overtime should show live dilution');
assert.ok(parseFloat(overtime.effectiveHourly) < parseFloat(overtime.baseHourly));

const mockNow = computeMockOvertimeNow(workingRecord, settings, workingNow.getTime());
const mocked = buildHomeView(settings, workingRecord, mockNow);
assert.strictEqual(mocked.ringColor, '#f97316');
assert.ok(mocked.dilutionDisplay > 0);
assert.strictEqual(mocked.inOvertime, true);
assert.ok(mocked.overtimeDuration.length > 0);

const mockLater = computeMockOvertimeNow(workingRecord, settings, workingNow.getTime() + 60000);
const mockedLater = buildHomeView(settings, workingRecord, mockLater);
assert.ok(parseFloat(mockedLater.earned) === parseFloat(mocked.earned), 'overtime caps daily earned');
assert.ok(mockedLater.dilutionDisplay >= mocked.dilutionDisplay, 'dilution increases while capped');

// 午休自动切换 + 计薪冻结（默认作息午休 12:00–13:00）
const lunchEarly = buildHomeView(settings, workingRecord, new Date('2026-06-22T12:30:00+08:00'));
assert.strictEqual(lunchEarly.restMode, true, '午休时段进入休息 UI');
assert.strictEqual(lunchEarly.restLabel, '午休');
assert.strictEqual(lunchEarly.restEndsAt, '13:00');
assert.strictEqual(lunchEarly.restCountdown, '30:00');
assert.strictEqual(lunchEarly.ringColor, '#2dd4bf', '休息态圆环为青色');
assert.strictEqual(lunchEarly.inOvertime, false);

const lunchLate = buildHomeView(settings, workingRecord, new Date('2026-06-22T12:50:00+08:00'));
assert.strictEqual(lunchLate.restMode, true);
assert.strictEqual(
  parseFloat(lunchLate.earned),
  parseFloat(lunchEarly.earned),
  '午休期间今日已赚保持不变'
);

// 午休结束自动切回赚钱 UI，金额从冻结值继续上涨
const afterLunch = buildHomeView(settings, workingRecord, new Date('2026-06-22T13:30:00+08:00'));
assert.strictEqual(afterLunch.restMode, false, '午休结束自动切回');
assert.ok(
  parseFloat(afterLunch.earned) > parseFloat(lunchLate.earned),
  '午休后从冻结值继续累积，且不跳涨补偿午休时段'
);

// 已收工记录不展示休息 UI
const doneRecord = { date: '2026-06-22', startTime: '09:00', endTime: '18:00' };
const done = buildHomeView(settings, doneRecord, new Date('2026-06-22T18:30:00+08:00'));
assert.strictEqual(done.restMode, false);

// 计薪锚点：晚打卡（12:50 起）也按预设上班时间 09:00 计薪，14:00 时＝上午+下午 4h
const lateTap = { date: '2026-06-22', startTime: '12:50', endTime: null };
const lateView = buildHomeView(settings, lateTap, new Date('2026-06-22T14:00:00+08:00'));
assert.ok(
  Math.abs(parseFloat(lateView.earned) - baseHourly * 4) < 0.05,
  '晚打卡仍按预设上班时间锚定，14:00 计薪 4h'
);
// 与准点打卡（09:00 起）同一时刻金额一致，证明早晚打卡不改变当天工资
const onTimeTap = { date: '2026-06-22', startTime: '09:00', endTime: null };
const onTimeView = buildHomeView(settings, onTimeTap, new Date('2026-06-22T14:00:00+08:00'));
assert.strictEqual(lateView.earned, onTimeView.earned, '早到/晚到当天工资不变');

// 工作日到点自动开始（2026-06-22 为周一）
const autoRec = autoStartWorkIfDue(new Date('2026-06-22T10:00:00+08:00'));
assert.ok(autoRec, '工作日工作时段内应自动开始');
assert.strictEqual(autoRec.startTime, '09:00', '自动开始锚定预设上班时间');
assert.strictEqual(autoRec.autoStarted, true);
// 已有今日记录 → 不重复创建
assert.strictEqual(autoStartWorkIfDue(new Date('2026-06-22T11:00:00+08:00')), null);

// 周末不自动开始（2026-06-21 为周日）
assert.strictEqual(autoStartWorkIfDue(new Date('2026-06-21T10:00:00+08:00')), null, '周末不自动开始');
// 工作日但已过下班时段（周二 20:00）不自动开始
assert.strictEqual(
  autoStartWorkIfDue(new Date('2026-06-23T20:00:00+08:00')),
  null,
  '过了工作时段不自动开始'
);
// 纯周末（2026-06-14 周日，非节假日）不自动开始
assert.strictEqual(autoStartWorkIfDue(new Date('2026-06-14T10:00:00+08:00')), null, '周日不自动开始');
// 法定节假日（2026-10-01 国庆）不自动开始
assert.strictEqual(autoStartWorkIfDue(new Date('2026-10-01T10:00:00+08:00')), null, '法定节假日不自动开始');

// ---- 节假日 / 休息日（P2）----
const holidayMap = require('../../miniprogram/assets/holidays/CN-2026.js');

// 普通周六（2026-06-13）无记录 → 休息态、2 倍
const weekendRest = buildHomeView(settings, null, new Date('2026-06-13T10:00:00+08:00'), holidayMap);
assert.strictEqual(weekendRest.state, 'rest');
assert.strictEqual(weekendRest.restDayKind, 'weekend');
assert.strictEqual(weekendRest.premiumMultiplier, 2);
assert.strictEqual(weekendRest.earned, '0.00');

// 法定节假日（2026-10-01 国庆）无记录 → 休息态、3 倍、带节日名
const holidayRest = buildHomeView(settings, null, new Date('2026-10-01T10:00:00+08:00'), holidayMap);
assert.strictEqual(holidayRest.state, 'rest');
assert.strictEqual(holidayRest.restDayKind, 'holiday');
assert.strictEqual(holidayRest.premiumMultiplier, 3);
assert.strictEqual(holidayRest.holidayName, '国庆节');

// 节假日上班（3 倍）：09:00–12:00 = 3h 计薪 → baseHourly*3*3
const holidayWork = { date: '2026-10-01', startTime: '09:00', endTime: null, dayType: 'statutory_holiday' };
const holidayWorking = buildHomeView(settings, holidayWork, new Date('2026-10-01T12:00:00+08:00'), holidayMap);
assert.strictEqual(holidayWorking.state, 'working');
assert.strictEqual(holidayWorking.premiumMode, true);
assert.strictEqual(holidayWorking.premiumMultiplier, 3);
assert.ok(Math.abs(parseFloat(holidayWorking.earned) - baseHourly * 9) < 0.05, '节假日 3h 计 3 倍 = baseHourly*9');

// 节假日选择调休 → 不计薪
const compWork = { date: '2026-10-01', startTime: '09:00', endTime: null, compLeave: true };
const compWorking = buildHomeView(settings, compWork, new Date('2026-10-01T12:00:00+08:00'), holidayMap);
assert.strictEqual(compWorking.premiumMode, true);
assert.strictEqual(compWorking.compLeave, true);
assert.strictEqual(compWorking.earned, '0.00', '调休当日不计薪');

// 补录预览：节假日按 3 倍计（09:00–12:00 = 3h → baseHourly*9）
const { buildRecordEditView } = require('../../miniprogram/services/clock');
const editHoliday = buildRecordEditView(settings, '09:00', '12:00', {
  date: '2026-10-01',
  holidayMap,
});
assert.strictEqual(editHoliday.isPremiumDay, true);
assert.strictEqual(editHoliday.premiumMultiplier, 3);
assert.ok(Math.abs(parseFloat(editHoliday.earned) - baseHourly * 9) < 0.05, '补录节假日 3 倍');
// 补录选择调休 → 不计薪
const editComp = buildRecordEditView(settings, '09:00', '12:00', {
  date: '2026-10-01',
  holidayMap,
  compLeave: true,
});
assert.strictEqual(editComp.earned, '0.00');
// 普通工作日补录走原逻辑
const editWorkday = buildRecordEditView(settings, '09:00', '18:00', {
  date: '2026-06-22',
  holidayMap,
});
assert.strictEqual(editWorkday.isPremiumDay, false);
assert.strictEqual(editWorkday.inOvertime, false, '工作日 09-18 扣午休后无白加');
assert.ok(parseFloat(editWorkday.earned) > 0);

// 墓碑不阻挡自动开始（仅有效记录阻挡）
__storage.xsb_settings = { ...settings, autoStartEnabled: true };
__storage.xsb_records = [{
  id: 'rec_tomb',
  date: '2026-06-22',
  startTime: '09:00',
  endTime: '18:00',
  deleted: true,
  updatedAt: 1,
}];
const autoAfterTombstone = autoStartWorkIfDue(new Date('2026-06-22T11:00:00+08:00'));
assert.ok(autoAfterTombstone, '仅有墓碑时可自动开始');
assert.strictEqual(autoAfterTombstone.startTime, '09:00');

console.log('clock.test.js: ok');
