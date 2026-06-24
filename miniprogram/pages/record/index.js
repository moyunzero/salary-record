const { getSettings } = require('../../services/settings');
const {
  todayStr,
  getRecordByDate,
  getTodayRecord,
  buildRecordEditView,
  upsertManualRecord,
  deleteRecord,
} = require('../../services/clock');
const { getHolidayMapForYears } = require('../../services/holidays');

Page({
  behaviors: [require('../../behaviors/safe-area')],

  data: {
    recordId: '',
    date: '',
    startTime: '09:00',
    endTime: '18:00',
    previewValid: false,
    earned: '0.00',
    effectiveHourly: '0.00',
    dilutionDisplay: 0,
    hourlyColor: '#22c55e',
    inOvertime: false,
    overtimeDuration: '',
    hasExisting: false,
    isPremiumDay: false,
    premiumMultiplier: 1,
    dayBadge: '',
    compLeave: false,
  },

  holidayMapFor(date) {
    const year = date ? Number(date.slice(0, 4)) : new Date().getFullYear();
    return getHolidayMapForYears([year, year + 1]);
  },

  onShow() {
    const app = getApp();
    const editDate = app.globalData.editRecordDate;
    if (editDate) {
      app.globalData.editRecordDate = null;
      this.loadDate(editDate);
      return;
    }
    if (!this.data.date) {
      this.loadDate(todayStr());
    }
  },

  loadDate(date) {
    const rec = getRecordByDate(date);
    this.setData({
      recordId: rec?.id || '',
      date,
      startTime: rec?.startTime || '09:00',
      endTime: rec?.endTime || '18:00',
      hasExisting: !!rec,
      compLeave: !!(rec && rec.compLeave),
    });
    this.refreshPreview();
  },

  onToggleCompLeave(e) {
    this.setData({ compLeave: e.detail.value }, () => this.refreshPreview());
  },

  onDateChange(e) {
    this.loadDate(e.detail.value);
  },

  onStartTimeChange(e) {
    this.setData({ startTime: e.detail.value });
    this.refreshPreview();
  },

  onEndTimeChange(e) {
    this.setData({ endTime: e.detail.value });
    this.refreshPreview();
  },

  refreshPreview() {
    const settings = getSettings();
    const view = buildRecordEditView(settings, this.data.startTime, this.data.endTime, {
      date: this.data.date,
      holidayMap: this.holidayMapFor(this.data.date),
      compLeave: this.data.compLeave,
    });
    let dayBadge = '';
    if (view.dayType === 'statutory_holiday') {
      dayBadge = `${view.holidayName || '法定节假日'} · ${view.premiumMultiplier}× 加班费`;
    } else if (view.dayType === 'weekly_rest') {
      dayBadge = `休息日 · ${view.premiumMultiplier}× 加班费`;
    } else if (view.dayType === 'makeup_workday') {
      dayBadge = '调休补班日 · 正常计薪';
    }
    this.setData({
      previewValid: view.valid,
      earned: view.earned,
      effectiveHourly: view.effectiveHourly,
      dilutionDisplay: view.dilutionDisplay,
      hourlyColor: view.hourlyColor,
      inOvertime: view.inOvertime,
      overtimeDuration: view.overtimeDuration,
      isPremiumDay: view.isPremiumDay,
      premiumMultiplier: view.premiumMultiplier,
      dayBadge,
    });
  },

  onSave() {
    const today = getTodayRecord();
    if (this.data.date === todayStr() && today && !today.endTime) {
      wx.showToast({ title: '今天还没跑路，回首页先收工', icon: 'none' });
      return;
    }
    if (!this.data.previewValid) {
      wx.showToast({ title: '跑路时间不能早于上工时间', icon: 'none' });
      return;
    }
    const result = upsertManualRecord({
      id: this.data.recordId || undefined,
      date: this.data.date,
      startTime: this.data.startTime,
      endTime: this.data.endTime,
      compLeave: this.data.isPremiumDay ? this.data.compLeave : false,
    });
    if (!result.ok) {
      wx.showToast({ title: '存不上，时间再调调', icon: 'none' });
      return;
    }
    this.setData({
      recordId: result.record.id,
      hasExisting: true,
    });
    wx.showToast({ title: '血汗已入账', icon: 'success' });
  },

  onDelete() {
    if (!this.data.recordId) return;
    wx.showModal({
      title: '删掉这天',
      content: `确定抹掉 ${this.data.date} 这天的血汗？删了就当没搬过，找不回来。`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        if (deleteRecord(this.data.recordId)) {
          this.setData({
            recordId: '',
            hasExisting: false,
            startTime: '09:00',
            endTime: '18:00',
          });
          this.refreshPreview();
          wx.showToast({ title: '这天不存在了', icon: 'success' });
        }
      },
    });
  },

  onBack() {
    wx.navigateBack();
  },
});
