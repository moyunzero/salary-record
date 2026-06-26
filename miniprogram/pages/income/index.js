const { getRecords, isFutureDate } = require('../../services/clock');
const { getHolidayMapForYears } = require('../../services/holidays');
const {
  bucketLast7Days,
  bucketMonthByWeek,
  markedDatesFromRecords,
  filterCompleted,
} = require('../../core/aggregate');

function formatMoney(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

const _now = new Date();

Page({
  behaviors: [require('../../behaviors/safe-area')],

  data: {
    chartMode: 'week',
    chartData: { categories: [], series: [{ name: '收入', data: [] }] },
    periodTotal: '0.00',
    periodAvg: '0.00',
    hasData: false,
    calendarYear: _now.getFullYear(),
    calendarMonth: _now.getMonth() + 1,
    markedDates: [],
    holidays: {},
    showOfficialHolidays: true,
    workCalendarSettings: {},
  },

  onLoad() {
    this._chartSnap = '';
    this.syncWorkCalendarSettings();
    this.updateHolidays();
    this.syncHolidayDisplaySetting();
  },

  onShow() {
    this.syncWorkCalendarSettings();
    this.syncHolidayDisplaySetting();
    this.refresh();
  },

  syncWorkCalendarSettings() {
    const { getSettings } = require('../../services/settings');
    const s = getSettings();
    const next = {
      restSystem: s.restSystem || 'double_rest',
      bigSmall: s.bigSmall || { anchorWeekDate: '', anchorType: 'big' },
      workWeekdays: s.workWeekdays || [1, 2, 3, 4, 5],
      holidayAutoRest: s.holidayAutoRest !== false,
    };
    if (JSON.stringify(next) !== JSON.stringify(this.data.workCalendarSettings)) {
      this.setData({ workCalendarSettings: next });
    }
  },

  syncHolidayDisplaySetting() {
    const { getSettings } = require('../../services/settings');
    const showOfficialHolidays = getSettings().holidayAutoRest !== false;
    if (showOfficialHolidays !== this.data.showOfficialHolidays) {
      this.setData({ showOfficialHolidays });
    }
  },

  currentChartMonth() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  },

  // 加载当前展示年份的节假日表（含次年，覆盖跨年）
  updateHolidays() {
    const year = this.data.calendarYear;
    if (this._holidayYear !== year) {
      this._holidayYear = year;
      this.setData({ holidays: getHolidayMapForYears([year, year + 1]) });
    }
  },

  refresh() {
    const records = getRecords();
    const completed = filterCompleted(records);
    const hasData = completed.length > 0;
    const markedDates = markedDatesFromRecords(records);
    const patch = {};

    if (hasData !== this.data.hasData) patch.hasData = hasData;
    if (JSON.stringify(markedDates) !== JSON.stringify(this.data.markedDates)) {
      patch.markedDates = markedDates;
    }

    if (hasData) {
      let bucket;
      if (this.data.chartMode === 'month') {
        const { year, month } = this.currentChartMonth();
        bucket = bucketMonthByWeek(records, year, month);
      } else {
        bucket = bucketLast7Days(records);
      }
      const snap = JSON.stringify({
        mode: this.data.chartMode,
        year: this.data.chartMode === 'month' ? this.currentChartMonth().year : this.data.calendarYear,
        month: this.data.chartMode === 'month' ? this.currentChartMonth().month : this.data.calendarMonth,
        categories: bucket.categories,
        data: bucket.data,
      });
      if (snap !== this._chartSnap) {
        this._chartSnap = snap;
        const total = bucket.data.reduce((sum, v) => sum + v, 0);
        const activeDays = bucket.data.filter((v) => v > 0).length;
        const avg = activeDays > 0 ? total / activeDays : 0;
        patch.chartData = {
          categories: Array.isArray(bucket.categories) ? bucket.categories : [],
          series: [{ name: '收入', data: Array.isArray(bucket.data) ? bucket.data : [] }],
        };
        patch.periodTotal = formatMoney(total);
        patch.periodAvg = formatMoney(avg);
      }
    } else if (this._chartSnap) {
      this._chartSnap = '';
      patch.chartData = { categories: [], series: [{ name: '收入', data: [] }] };
      patch.periodTotal = '0.00';
      patch.periodAvg = '0.00';
    }

    if (Object.keys(patch).length) {
      this.setData(patch);
    }
  },

  _applyChart(records) {
    let bucket;
    if (this.data.chartMode === 'month') {
      const { year, month } = this.currentChartMonth();
      bucket = bucketMonthByWeek(records, year, month);
    } else {
      bucket = bucketLast7Days(records);
    }
    const chartMonth = this.currentChartMonth();
    const total = bucket.data.reduce((sum, v) => sum + v, 0);
    const activeDays = bucket.data.filter((v) => v > 0).length;
    const avg = activeDays > 0 ? total / activeDays : 0;
    this._chartSnap = JSON.stringify({
      mode: this.data.chartMode,
      year: this.data.chartMode === 'month' ? chartMonth.year : this.data.calendarYear,
      month: this.data.chartMode === 'month' ? chartMonth.month : this.data.calendarMonth,
      categories: bucket.categories,
      data: bucket.data,
    });
    this.setData({
      chartData: {
        categories: Array.isArray(bucket.categories) ? bucket.categories : [],
        series: [{ name: '收入', data: Array.isArray(bucket.data) ? bucket.data : [] }],
      },
      periodTotal: formatMoney(total),
      periodAvg: formatMoney(avg),
    });
  },

  onChartModeWeek() {
    if (this.data.chartMode === 'week') return;
    this.setData({ chartMode: 'week' });
    this._applyChart(getRecords());
  },

  onChartModeMonth() {
    if (this.data.chartMode === 'month') return;
    this.setData({ chartMode: 'month' });
    this._applyChart(getRecords());
  },

  onPrevMonth() {
    let { calendarYear, calendarMonth } = this.data;
    calendarMonth -= 1;
    if (calendarMonth < 1) {
      calendarMonth = 12;
      calendarYear -= 1;
    }
    this.setData({ calendarYear, calendarMonth }, () => this.updateHolidays());
  },

  onNextMonth() {
    let { calendarYear, calendarMonth } = this.data;
    calendarMonth += 1;
    if (calendarMonth > 12) {
      calendarMonth = 1;
      calendarYear += 1;
    }
    this.setData({ calendarYear, calendarMonth }, () => this.updateHolidays());
  },

  onCalendarDayTap(e) {
    const { date } = e.detail;
    if (!date) return;
    if (isFutureDate(date)) {
      wx.showToast({ title: '还没到的日子，卷不了', icon: 'none' });
      return;
    }
    const app = getApp();
    app.globalData.editRecordDate = date;
    wx.navigateTo({ url: '/pages/record/index' });
  },

  onBack() {
    wx.navigateBack();
  },
});
