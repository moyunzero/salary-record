const { DEFAULT_INSURANCE, calcNetMonthly, INSURANCE_PERSONAL_LIMITS, insuranceToPercent, percentToInsurance, clampInsurancePercent } = require('../../core/insurance');
const { calcBaseHourly, roundMoney } = require('../../core/salary');
const { INSURANCE_PRESETS, WORK_PRESETS, roundPercent } = require('../../constants/presets');
const { defaultWorkSchedule, computeDailyWorkHours } = require('../../core/work-schedule');
const { saveSettings } = require('../../services/settings');
const { vibrateShort } = require('../../services/platform');

function formatMoney(n) {
  const v = Math.round(Number(n) || 0);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

Page({
  data: {
    statusBarHeight: 44,
    safeBottom: 0,
    monthlySalary: '',
    insurance: { ...DEFAULT_INSURANCE },
    standardHoursPerDay: 8,
    workDaysPerMonth: 21.75,
    insurancePercent: {
      pension: 8,
      medical: 2,
      unemployment: 0.5,
      fund: 12,
    },
    insurancePresets: INSURANCE_PRESETS,
    insuranceLimits: INSURANCE_PERSONAL_LIMITS,
    workPresets: WORK_PRESETS,
    selectedInsurancePreset: 'national_common',
    selectedWorkPreset: 'legal_double_rest',
    restSystem: 'double_rest',
    workSchedule: null,
    nightShiftEnabled: false,
    insuranceFineTuneOpen: false,
    workFineTuneOpen: false,
    showPreview: false,
    previewHourly: '0.00',
    previewNetMonthly: '0',
    previewMonthlyHours: '174',
    canFinish: false,
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const safeBottom = win.safeArea ? win.screenHeight - win.safeArea.bottom : 0;
    const defaultPreset = WORK_PRESETS.find((p) => p.id === 'legal_double_rest');
    this.setData({
      statusBarHeight: win.statusBarHeight || 44,
      safeBottom,
      workSchedule: defaultPreset
        ? JSON.parse(JSON.stringify(defaultPreset.workSchedule))
        : defaultWorkSchedule(),
      nightShiftEnabled: false,
      restSystem: defaultPreset ? defaultPreset.restSystem : 'double_rest',
    });
    this.updatePreview();
  },

  mondayStr(now = new Date()) {
    const dow = now.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    const p = (n) => String(n).padStart(2, '0');
    return `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`;
  },

  updatePreview() {
    const salary = Number(this.data.monthlySalary);
    if (!salary || salary <= 0) {
      this.setData({ showPreview: false, canFinish: false });
      return;
    }
    const net = calcNetMonthly(salary, this.data.insurance);
    const hourly = calcBaseHourly(net, this.data.workDaysPerMonth, this.data.standardHoursPerDay);
    const monthlyHours = this.data.workDaysPerMonth * this.data.standardHoursPerDay;
    this.setData({
      showPreview: true,
      canFinish: true,
      previewHourly: roundMoney(hourly).toFixed(2),
      previewNetMonthly: formatMoney(net),
      previewMonthlyHours: String(roundPercent(monthlyHours, 1)),
    });
  },

  onSalaryInput(e) {
    this.setData({ monthlySalary: e.detail.value }, () => this.updatePreview());
  },

  onSelectInsurancePreset(e) {
    const id = e.currentTarget.dataset.id;
    const preset = INSURANCE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.setData(
      {
        selectedInsurancePreset: id,
        insurance: { ...preset.insurance },
        insurancePercent: { ...preset.insurancePercent },
      },
      () => this.updatePreview()
    );
  },

  onSelectWorkPreset(e) {
    const id = e.currentTarget.dataset.id;
    const preset = WORK_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.setData(
      {
        selectedWorkPreset: id,
        standardHoursPerDay: preset.standardHoursPerDay,
        workDaysPerMonth: preset.workDaysPerMonth,
        restSystem: preset.restSystem || 'double_rest',
        workSchedule: preset.workSchedule
          ? JSON.parse(JSON.stringify(preset.workSchedule))
          : defaultWorkSchedule(),
        nightShiftEnabled: !!preset.nightShiftEnabled,
      },
      () => this.updatePreview()
    );
  },

  onInsuranceSlider(e) {
    const key = e.currentTarget.dataset.key;
    if (INSURANCE_PERSONAL_LIMITS[key]?.fixed) return;
    const raw = Number(e.detail.value);
    const insurancePercent = clampInsurancePercent({ ...this.data.insurancePercent, [key]: raw });
    const insurance = percentToInsurance(insurancePercent);
    this.setData(
      {
        selectedInsurancePreset: 'custom',
        insurancePercent,
        insurance,
      },
      () => this.updatePreview()
    );
  },

  onStandardHours(e) {
    this.setData(
      { selectedWorkPreset: 'custom', standardHoursPerDay: Number(e.detail.value) || 8 },
      () => this.updatePreview()
    );
  },

  onWorkDays(e) {
    this.setData(
      {
        selectedWorkPreset: 'custom',
        workDaysPerMonth: roundPercent(Number(e.detail.value) || 21.75, 2),
      },
      () => this.updatePreview()
    );
  },

  toggleInsuranceFineTune() {
    this.setData({ insuranceFineTuneOpen: !this.data.insuranceFineTuneOpen });
  },

  toggleWorkFineTune() {
    this.setData({ workFineTuneOpen: !this.data.workFineTuneOpen });
  },

  onFinish() {
    const salary = Number(this.data.monthlySalary);
    if (!salary || salary <= 0) {
      wx.showToast({ title: '卖身价填一个，总不能白卖命', icon: 'none' });
      return;
    }
    vibrateShort('light');
    const workSchedule = this.data.workSchedule || defaultWorkSchedule();
    const nightShiftEnabled = !!this.data.nightShiftEnabled;
    const scheduleHours = computeDailyWorkHours(workSchedule, nightShiftEnabled);
    const restSystem = this.data.restSystem || 'double_rest';
    const payload = {
      monthlySalary: salary,
      insurance: this.data.insurance,
      workDaysPerMonth: this.data.workDaysPerMonth,
      workSchedule,
      nightShiftEnabled,
      restSystem,
      holidayAutoRest: true,
      onboardingDone: true,
    };
    if (this.data.selectedWorkPreset === 'custom') {
      payload.standardHoursPerDay = this.data.standardHoursPerDay;
    } else {
      payload.standardHoursPerDay = scheduleHours;
    }
    if (restSystem === 'big_small_week') {
      payload.bigSmall = { anchorWeekDate: this.mondayStr(), anchorType: 'big' };
    }
    saveSettings(payload);
    wx.switchTab({ url: '/pages/home/index' });
  },
});
