const { isOnboardingDone, getSettings } = require('../../services/settings');
const {
  getTodayRecord,
  findUnfinishedPriorRecord,
  closeRecordAt,
  startWork,
  clockOut,
  buildHomeView,
  isDevMockOvertime,
  toggleDevMockOvertime,
  computeMockOvertimeNow,
  seedDevCrossDayRecord,
  todayStr,
} = require('../../services/clock');
const { vibrateShort } = require('../../services/platform');
const { resolvePetContext } = require('../../core/pet-context');
const { CROSS_DAY_DEFER_KEY } = require('../../constants/storage-keys');

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

function amountSizeClass(value) {
  const len = String(value).length;
  if (len <= 5) return 'home-amount-lg';
  if (len <= 7) return 'home-amount-md';
  return 'home-amount-sm';
}

function heroLabelFor(state) {
  if (state === 'working') return '今日已赚';
  if (state === 'done') return '今日收入';
  return '基础时薪';
}

function buildRingSvgStyle(pct, color) {
  const clamped = Math.min(100, Math.max(0, pct));
  const track = 'rgba(255,255,255,0.14)';
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="${track}" stroke-width="7"/>`;
  if (clamped > 0) {
    svg += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" transform="rotate(-90 50 50)"/>`;
  }
  svg += '</svg>';
  return `background-image: url("data:image/svg+xml,${encodeURIComponent(svg)}"); background-size: 100% 100%;`;
}

function buildSharePayload(record) {
  return {
    date: record.date || todayStr(),
    startTime: record.startTime,
    endTime: record.endTime,
    earned: Number(record.earned || 0).toFixed(2),
    effectiveHourly: Number(record.effectiveHourly || 0).toFixed(2),
    dilutionDisplay: Math.round((record.dilutionPct || 0) * 100),
  };
}

Page({
  behaviors: [require('../../behaviors/safe-area')],

  data: {
    state: 'idle',
    baseHourly: '0.00',
    earned: '0.00',
    effectiveHourly: '0.00',
    dilutionPct: 0,
    dilutionDisplay: 0,
    ringPct: 0,
    ringDeg: 0,
    ringColor: '#22c55e',
    hourlyColor: '#22c55e',
    startTime: '',
    endTime: '',
    ringSvgStyle: '',
    ringGlowStyle: '',
    heroLabel: '基础时薪',
    heroAmount: '0.00',
    amountSizeClass: 'home-amount-lg',
    inOvertime: false,
    devMockOvertime: false,
    showMoneyRain: false,
    showShareSheet: false,
    ritualActive: false,
    sharePayload: null,
    shareImagePath: '',
    petContext: 'beforeWork',
    petEscalation: 0,
  },

  _timer: null,
  _redirecting: false,

  onLoad() {
    if (!isOnboardingDone()) {
      this._redirecting = true;
      wx.redirectTo({ url: '/pages/onboarding/index' });
    }
  },

  onShow() {
    if (this._redirecting || !isOnboardingDone()) return;
    if (this.data.ritualActive && !this.data.showMoneyRain && !this.data.showShareSheet) {
      this.setData({ showShareSheet: true });
    }
    this.handleCrossDay().then(() => {
      this.refresh();
      this._timer = setInterval(() => this.refresh(), 1000);
    });
  },

  handleCrossDay() {
    return new Promise((resolve) => {
      const orphan = findUnfinishedPriorRecord();
      if (!orphan) {
        resolve();
        return;
      }
      if (wx.getStorageSync(CROSS_DAY_DEFER_KEY) === orphan.date) {
        resolve();
        return;
      }
      wx.showModal({
        title: '昨日未收工',
        content: '是否在 23:59 自动收工并结算昨日工时？',
        confirmText: '自动收工',
        cancelText: '稍后处理',
        success: (res) => {
          if (res.confirm) {
            wx.removeStorageSync(CROSS_DAY_DEFER_KEY);
            closeRecordAt(orphan, '23:59');
          } else {
            wx.setStorageSync(CROSS_DAY_DEFER_KEY, orphan.date);
          }
          resolve();
        },
        fail: () => resolve(),
      });
    });
  },

  onHide() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  onUnload() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  refresh() {
    const settings = getSettings();
    const record = getTodayRecord();
    let now = new Date();
    const devMockOvertime = isDevMockOvertime();
    if (devMockOvertime && record && !record.endTime) {
      now = computeMockOvertimeNow();
    }
    const view = buildHomeView(settings, record, now);
    const pet = resolvePetContext(view.state, now, settings);
    const ringPctDisplay = view.state === 'idle' ? 0 : view.ringPct;
    const ringSvgStyle = buildRingSvgStyle(ringPctDisplay, view.ringColor);
    const ringGlowStyle = `box-shadow: 0 0 60rpx ${hexToRgba(view.ringColor, 0.15)}`;
    const heroAmount = view.state === 'idle' ? view.baseHourly : view.earned;
    const next = {
      ...view,
      heroLabel: heroLabelFor(view.state),
      heroAmount,
      amountSizeClass: amountSizeClass(heroAmount),
      inOvertime: !!view.inOvertime,
      devMockOvertime,
      ringSvgStyle,
      ringGlowStyle,
      petContext: pet.context,
      petEscalation: pet.escalation,
    };
    const keys = Object.keys(next);
    let changed = false;
    for (let i = 0; i < keys.length; i += 1) {
      if (this.data[keys[i]] !== next[keys[i]]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      this.setData(next);
    }
  },

  onToggleMockOvertime() {
    if (wx.getAccountInfoSync().miniProgram.envVersion !== 'develop') return;
    const record = getTodayRecord();
    if (!record || record.endTime) {
      wx.showToast({ title: '请先开始上班', icon: 'none' });
      return;
    }
    const on = toggleDevMockOvertime();
    this.refresh();
    wx.showToast({ title: on ? '已模拟超时' : '已恢复实时', icon: 'none' });
  },

  onDevSeedCrossDay() {
    if (wx.getAccountInfoSync().miniProgram.envVersion !== 'develop') return;
    seedDevCrossDayRecord();
    wx.showToast({ title: '已注入昨日未收工', icon: 'none' });
    this.handleCrossDay().then(() => this.refresh());
  },

  onStartWork() {
    startWork();
    this.refresh();
  },

  onClockOut() {
    if (this.data.ritualActive) return;
    const result = clockOut();
    if (!result) {
      wx.showToast({ title: '请先开始上班', icon: 'none' });
      return;
    }
    vibrateShort('medium');
    this.refresh();
    this.setData({
      showMoneyRain: true,
      ritualActive: true,
      sharePayload: buildSharePayload(result),
    });
  },

  onMoneyRainComplete() {
    this.setData({ showMoneyRain: false });
    setTimeout(() => {
      this.setData({ showShareSheet: true });
    }, 200);
  },

  onShareExported(e) {
    const path = e.detail.path;
    if (path) {
      this.setData({ shareImagePath: path });
    }
  },

  onShareCardShared(e) {
    const path = e.detail.path;
    if (path) {
      this.setData({ shareImagePath: path });
    }
  },

  onShareClose() {
    this.setData({
      showShareSheet: false,
      ritualActive: false,
      sharePayload: null,
      shareImagePath: '',
    });
    wx.showToast({ title: '收工成功', icon: 'success' });
  },

  onShareAppMessage() {
    const path = this.data.shareImagePath;
    const payload = this.data.sharePayload;
    if (path && payload) {
      return {
        title: `今日收工 ¥${payload.earned}`,
        path: '/pages/home/index',
        imageUrl: path,
      };
    }
    return { title: '薪时宝 — 今日收工', path: '/pages/home/index' };
  },
});
