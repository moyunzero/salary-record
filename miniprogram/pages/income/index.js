const { getRecords } = require('../../services/clock');
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
  },

  onLoad() {
    this._chartSnap = '';
    this.updateHolidays();
  },

  onShow() {
    this.refresh();
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
        bucket = bucketMonthByWeek(
          records,
          this.data.calendarYear,
          this.data.calendarMonth
        );
      } else {
        bucket = bucketLast7Days(records);
      }
      const snap = JSON.stringify({
        mode: this.data.chartMode,
        year: this.data.calendarYear,
        month: this.data.calendarMonth,
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
      bucket = bucketMonthByWeek(
        records,
        this.data.calendarYear,
        this.data.calendarMonth
      );
    } else {
      bucket = bucketLast7Days(records);
    }
    const total = bucket.data.reduce((sum, v) => sum + v, 0);
    const activeDays = bucket.data.filter((v) => v > 0).length;
    const avg = activeDays > 0 ? total / activeDays : 0;
    this._chartSnap = JSON.stringify({
      mode: this.data.chartMode,
      year: this.data.calendarYear,
      month: this.data.calendarMonth,
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
    if (this.data.chartMode === 'month') {
      this._applyChart(getRecords());
    }
  },

  onNextMonth() {
    let { calendarYear, calendarMonth } = this.data;
    calendarMonth += 1;
    if (calendarMonth > 12) {
      calendarMonth = 1;
      calendarYear += 1;
    }
    this.setData({ calendarYear, calendarMonth }, () => this.updateHolidays());
    if (this.data.chartMode === 'month') {
      this._applyChart(getRecords());
    }
  },

  onCalendarDayTap(e) {
    const { date } = e.detail;
    if (!date) return;
    const app = getApp();
    app.globalData.editRecordDate = date;
    wx.navigateTo({ url: '/pages/record/index' });
  },

  onBack() {
    wx.navigateBack();
  },
});
