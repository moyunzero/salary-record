const { DEFAULT_INSURANCE, calcNetMonthly } = require('../../core/insurance');
const { calcBaseHourly, roundMoney } = require('../../core/salary');
const { INSURANCE_PRESETS, WORK_PRESETS, roundPercent } = require('../../constants/presets');
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
    workPresets: WORK_PRESETS,
    selectedInsurancePreset: 'national_common',
    selectedWorkPreset: 'legal_double_rest',
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
    this.setData({
      statusBarHeight: win.statusBarHeight || 44,
      safeBottom,
    });
    this.updatePreview();
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
      },
      () => this.updatePreview()
    );
  },

  onInsuranceSlider(e) {
    const key = e.currentTarget.dataset.key;
    const raw = Number(e.detail.value);
    const display = key === 'unemployment' ? roundPercent(raw, 2) : roundPercent(raw, 1);
    const insurancePercent = { ...this.data.insurancePercent, [key]: display };
    const insurance = { ...this.data.insurance, [key]: display / 100 };
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
      wx.showToast({ title: '月薪填一个，总不能白卖命', icon: 'none' });
      return;
    }
    vibrateShort('light');
    saveSettings({
      monthlySalary: salary,
      insurance: this.data.insurance,
      standardHoursPerDay: this.data.standardHoursPerDay,
      workDaysPerMonth: this.data.workDaysPerMonth,
      onboardingDone: true,
    });
    wx.switchTab({ url: '/pages/home/index' });
  },
});
