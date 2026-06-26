const { DAY_TYPE, resolveDayType } = require('../../core/work-calendar');

function pad2(n) {
  return String(n).padStart(2, '0');
}

Component({
  properties: {
    year: { type: Number, value: 2026 },
    month: { type: Number, value: 1 },
    markedDates: { type: Array, value: [] },
    holidays: { type: Object, value: {} },
    showOfficialHolidays: { type: Boolean, value: true },
    /** 工作制：restSystem / bigSmall / workWeekdays / holidayAutoRest */
    workSettings: { type: Object, value: {} },
  },

  data: {
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    cells: [],
    monthLabel: '',
  },

  observers: {
    'year, month, markedDates, holidays, showOfficialHolidays, workSettings': function () {
      this.buildGrid();
    },
  },

  lifetimes: {
    attached() {
      this.buildGrid();
    },
  },

  methods: {
    buildGrid() {
      const year = this.properties.year;
      const month = this.properties.month;
      if (!year || !month) return;
      const markedList = this.properties.markedDates;
      const markMap = {};
      (Array.isArray(markedList) ? markedList : []).forEach((m) => {
        if (typeof m === 'string') markMap[m] = 'work';
        else if (m && m.date) markMap[m.date] = m.kind || 'work';
      });
      const holidays = this.properties.holidays || {};
      const showOfficialHolidays = this.properties.showOfficialHolidays !== false;
      const workSettings = this.properties.workSettings || {};
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      const first = new Date(year, month - 1, 1);
      const daysInMonth = new Date(year, month, 0).getDate();
      const startOffset = (first.getDay() + 6) % 7;
      const cells = [];

      for (let i = 0; i < startOffset; i += 1) {
        cells.push({ empty: true, date: `pad-${i}` });
      }
      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = `${year}-${pad2(month)}-${pad2(day)}`;
        const h = holidays[date];
        const dayType = resolveDayType(date, workSettings, holidays);
        let tag = '';
        let holidayName = '';
        let isHoliday = false;
        let isWeeklyRest = false;
        if (showOfficialHolidays && h && h.type === 'public_holiday') {
          tag = '休';
          holidayName = h.name || '';
          isHoliday = true;
        } else if (showOfficialHolidays && h && h.type === 'transfer_workday') {
          tag = '班';
        } else if (dayType === DAY_TYPE.WEEKLY_REST) {
          isWeeklyRest = true;
        }
        cells.push({
          empty: false,
          day,
          date,
          marked: !!markMap[date],
          markKind: markMap[date] || 'work',
          tag,
          holidayName,
          isHoliday,
          isWeeklyRest,
          isToday: date === todayStr,
          isFuture: date > todayStr,
        });
      }
      while (cells.length % 7 !== 0) {
        cells.push({ empty: true, date: `empty-${cells.length}` });
      }

      this.setData({
        cells,
        monthLabel: `${year}年${month}月`,
      });
    },

    onDayTap(e) {
      const { date, future } = e.currentTarget.dataset;
      if (!date || future || String(date).indexOf('pad-') === 0 || String(date).indexOf('empty-') === 0) {
        return;
      }
      this.triggerEvent('daytap', { date });
    },
  },
});
