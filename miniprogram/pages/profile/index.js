const safeArea = require('../../behaviors/safe-area');
const { calcNetMonthly } = require('../../core/insurance');
const { calcBaseHourly, roundMoney } = require('../../core/salary');
const { getSettings } = require('../../services/settings');
const { getLastSyncAt, formatLastSyncDisplay } = require('../../services/sync');
const { roundPercent } = require('../../constants/presets');

function formatMoney(n) {
  const v = Math.round(Number(n) || 0);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

Page({
  behaviors: [safeArea],

  data: {
    previewHourly: '0.00',
    previewNetMonthly: '0',
    previewMonthlyHours: '174',
    settingsHint: '月薪、五险一金与工时 · 云备份未开启',
  },

  refreshPreview() {
    const s = getSettings();
    const salary = Number(s.monthlySalary);
    if (!salary || salary <= 0) {
      this.setData({
        previewHourly: '0.00',
        previewNetMonthly: '0',
        previewMonthlyHours: '174',
      });
      return;
    }
    const net = calcNetMonthly(salary, s.insurance);
    const hourly = calcBaseHourly(net, s.workDaysPerMonth, s.standardHoursPerDay);
    const monthlyHours = s.workDaysPerMonth * s.standardHoursPerDay;
    this.setData({
      previewHourly: roundMoney(hourly).toFixed(2),
      previewNetMonthly: formatMoney(net),
      previewMonthlyHours: String(roundPercent(monthlyHours, 1)),
    });
  },

  refreshSettingsHint() {
    const s = getSettings();
    let cloudPart = '云备份未开启';
    if (s.cloudSyncEnabled) {
      const display = formatLastSyncDisplay(getLastSyncAt());
      cloudPart = display === '尚未同步' ? '云备份已开启 · 尚未同步' : `云备份已开启 · ${display}`;
    }
    this.setData({
      settingsHint: `月薪、五险一金与工时 · ${cloudPart}`,
    });
  },

  onShow() {
    this.refreshPreview();
    this.refreshSettingsHint();
  },

  onLoad() {
    this.refreshPreview();
    this.refreshSettingsHint();
  },

  onGoRecord() {
    wx.navigateTo({ url: '/pages/record/index' });
  },

  onGoIncome() {
    wx.navigateTo({ url: '/pages/income/index' });
  },

  onGoSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },
});
