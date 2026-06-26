/** 五险一金与工作制度参考预设（个人缴纳部分，各地略有差异，仅供参考） */

const INSURANCE_PRESETS = [
  {
    id: 'national_common',
    name: '全国常见',
    note: '养老8% · 医疗2% · 失业0.5% · 公积金12%（法定上限）',
    insurance: { pension: 0.08, medical: 0.02, unemployment: 0.005, fund: 0.12 },
    insurancePercent: { pension: 8, medical: 2, unemployment: 0.5, fund: 12 },
  },
  {
    id: 'fund_5',
    name: '公积金5%',
    note: '社保同上，公积金按下限5%（法定最低档）',
    insurance: { pension: 0.08, medical: 0.02, unemployment: 0.005, fund: 0.05 },
    insurancePercent: { pension: 8, medical: 2, unemployment: 0.5, fund: 5 },
  },
];

const DEFAULT_WORK_SCHEDULE = {
  morning: { start: '09:00', end: '12:00' },
  lunch: { start: '12:00', end: '13:00' },
  afternoon: { start: '13:00', end: '18:00' },
  eveningRest: { start: '18:00', end: '19:00' },
  nightWork: { start: '19:00', end: '22:00' },
};

function cloneWorkSchedule() {
  return JSON.parse(JSON.stringify(DEFAULT_WORK_SCHEDULE));
}

const WORK_PRESETS = [
  {
    id: 'legal_double_rest',
    name: '法定双休',
    note: '劳动法：每日≤8小时；月计薪天数21.75',
    standardHoursPerDay: 8,
    workDaysPerMonth: 21.75,
    workSchedule: cloneWorkSchedule(),
    nightShiftEnabled: false,
    restSystem: 'double_rest',
  },
  {
    id: 'single_rest',
    name: '单休制',
    note: '每周休1天估算，约26个工作日/月',
    standardHoursPerDay: 8,
    workDaysPerMonth: 26,
    workSchedule: cloneWorkSchedule(),
    nightShiftEnabled: false,
    restSystem: 'single_rest',
  },
  {
    id: 'big_small_week',
    name: '大小周',
    note: '隔周单休估算，月均约23个工作日',
    standardHoursPerDay: 8,
    workDaysPerMonth: 23,
    workSchedule: cloneWorkSchedule(),
    nightShiftEnabled: false,
    restSystem: 'big_small_week',
  },
];

function roundPercent(value, decimals) {
  if (decimals === 2) {
    return Math.round(Number(value) * 100) / 100;
  }
  return Math.round(Number(value) * 10) / 10;
}

function formatPercent(value) {
  const rounded = roundPercent(value, 1);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

module.exports = {
  INSURANCE_PRESETS,
  WORK_PRESETS,
  roundPercent,
  formatPercent,
};
