const { isOnboardingDone, getSettings } = require('../../services/settings');
const {
  getTodayRecord,
  findUnfinishedPriorRecord,
  closeRecordAt,
  startWork,
  autoStartWorkIfDue,
  clockOut,
  buildHomeView,
  isDevMockOvertime,
  toggleDevMockOvertime,
  computeMockOvertimeNow,
  seedDevCrossDayRecord,
  todayStr,
} = require('../../services/clock');
const { vibrateShort } = require('../../services/platform');
const { getHolidayMapForYears } = require('../../services/holidays');
const { resolvePetContext } = require('../../core/pet-context');
const { defaultWorkSchedule } = require('../../core/work-schedule');
const { CROSS_DAY_DEFER_KEY } = require('../../constants/storage-keys');
const { isDevelopEnv } = require('../../utils/env');
const { petDockBottomGapPx } = require('../../utils/layout');

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
  if (state === 'working') return '今日血汗';
  if (state === 'done') return '今日血汗';
  if (state === 'rest') return '今天躺平';
  return '卷前价';
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
    heroLabel: '卷前价',
    heroAmount: '0.00',
    amountSizeClass: 'home-amount-lg',
    inOvertime: false,
    restMode: false,
    restLabel: '',
    restEndsAt: '',
    restCountdown: '',
    dayType: 'workday',
    premiumMultiplier: 1,
    premiumMode: false,
    compLeave: false,
    holidayName: '',
    restDayKind: 'weekend',
    devMockOvertime: false,
    showMoneyRain: false,
    showShareSheet: false,
    ritualActive: false,
    sharePayload: null,
    shareImagePath: '',
    petContext: 'beforeWork',
    petEscalation: 0,
    petMorningStart: '09:00',
    petLunchStart: '12:00',
    petDebugOpen: false,
    petDebugActive: false,
    petDebugScene: 'beforeWork',
    petDebugEscalation: 0,
    petDebugAppState: 'idle',
    petDebugDoneBand: '',
    petDebugForceClip: '',
    petDebugScenarioId: '',
    petDebugInfo: {},
    petDebugLiveContext: 'beforeWork',
    petDebugLiveEscalation: 0,
    petDebugEnabled: false,
    petDockTop: 400,
    petDockHeight: 0,
    petDockBottom: 5,
    petDebugPanelBottom: 200,
  },

  _timer: null,
  _redirecting: false,
  _restMode: null,
  _petDockTop: 0,
  _petDockHeight: 0,
  _petDockWidth: 0,
  _petDockBottom: 0,

  onLoad() {
    if (!isOnboardingDone()) {
      this._redirecting = true;
      wx.redirectTo({ url: '/pages/onboarding/index' });
      return;
    }
    if (isDevelopEnv()) {
      this.setData({ petDebugEnabled: true });
    }
  },

  onShow() {
    if (this._redirecting || !isOnboardingDone()) return;
    if (this.data.ritualActive && !this.data.showMoneyRain && !this.data.showShareSheet) {
      this.setData({ showShareSheet: true });
    }
    this.handleCrossDay().then(() => {
      autoStartWorkIfDue();
      this.refresh();
      wx.nextTick(() => this.measurePetDock());
      this._timer = setInterval(() => this.refresh(), 1000);
    });
  },

  onReady() {
    wx.nextTick(() => this.measurePetDock());
  },

  measurePetDock() {
    if (this._redirecting || !isOnboardingDone()) return;
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();

    this.createSelectorQuery()
      .select('.home-pet-bound-top')
      .boundingClientRect()
      .select('.home-pet-dock')
      .boundingClientRect()
      .exec((res) => {
        const topAnchor = res && res[0];
        const dockRect = res && res[1];
        if (!topAnchor || topAnchor.top <= 0) return;

        const top = topAnchor.top;
        const dockBottom = petDockBottomGapPx(win);
        const height = Math.round(win.windowHeight - top - dockBottom);
        const panelBottom = Math.max(72, Math.round(win.windowHeight - top - dockBottom + 8));
        const dockW = dockRect && dockRect.width > 0 ? Math.round(dockRect.width) : 0;
        const dockH = height > 0 ? height : 0;

        if (
          this._petDockTop === top &&
          this._petDockHeight === height &&
          this._petDockWidth === dockW &&
          this._petDockBottom === dockBottom
        ) {
          return;
        }
        if (height < 72) return;

        this._petDockTop = top;
        this._petDockHeight = height;
        this._petDockWidth = dockW;
        this._petDockBottom = dockBottom;
        this.setData({
          petDockTop: top,
          petDockHeight: height,
          petDockBottom: dockBottom,
          petDebugPanelBottom: panelBottom,
        });
        wx.nextTick(() => {
          const cat = this.selectComponent('#homeCat');
          if (cat && cat.setStageSize) {
            cat.setStageSize(dockW || 0, dockH);
          } else if (cat && cat.measureStage) {
            cat.measureStage();
          }
        });
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
        title: '昨天忘了跑路',
        content: '昨天没点收工，要按 23:59 帮你结算那天的血汗吗？',
        confirmText: '帮我收工',
        cancelText: '稍后再说',
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
    const view = buildHomeView(settings, record, now, this.getHolidayMap(now));
    const pet = resolvePetContext(view.state, now, settings);
    const schedule = settings.workSchedule || defaultWorkSchedule(settings.workStartTime);
    const displayPet = this.data.petDebugActive
      ? {
          context: this.data.petDebugScene,
          escalation: this.data.petDebugEscalation,
          appState: this.data.petDebugAppState,
        }
      : pet;
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
      petContext: displayPet.context,
      petEscalation: displayPet.escalation,
      petMorningStart: schedule.morning.start,
      petLunchStart: schedule.lunch.start,
      petDebugLiveContext: pet.context,
      petDebugLiveEscalation: pet.escalation,
    };
    if (this._restMode !== null && this._restMode !== next.restMode) {
      wx.showToast({
        title: next.restMode
          ? `${next.restLabel}到，刑期结束，卖身价照拿`
          : '摸鱼结束，继续当社畜',
        icon: 'none',
      });
    }
    this._restMode = next.restMode;
    const keys = Object.keys(next);
    let changed = false;
    for (let i = 0; i < keys.length; i += 1) {
      if (this.data[keys[i]] !== next[keys[i]]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      this.setData(next, () => wx.nextTick(() => this.measurePetDock()));
    }
  },

  onToggleMockOvertime() {
    if (!isDevelopEnv()) return;
    const record = getTodayRecord();
    if (!record || record.endTime) {
      wx.showToast({ title: '请先开始卷', icon: 'none' });
      return;
    }
    const on = toggleDevMockOvertime();
    this.refresh();
    wx.showToast({ title: on ? '已模拟超时' : '已恢复实时', icon: 'none' });
  },

  onDevSeedCrossDay() {
    if (!isDevelopEnv()) return;
    seedDevCrossDayRecord();
    wx.showToast({ title: '已注入昨日未收工', icon: 'none' });
    this.handleCrossDay().then(() => this.refresh());
  },

  onPetDebugLongPress() {
    if (!this.data.petDebugEnabled) return;
    const panel = this.selectComponent('#petDebugPanel');
    if (panel && panel.toggle) panel.toggle();
  },

  onPetDebugOpenChange(e) {
    const open = !!(e.detail && e.detail.open);
    this.setData({ petDebugOpen: open }, () => {
      if (open) wx.nextTick(() => this.measurePetDock());
    });
  },

  onPetDebugOverride(e) {
    const d = e.detail || {};
    const patch = {
      petDebugActive: !!d.active,
      petDebugScenarioId: d.scenarioId || '',
      petDebugScene: d.scene || this.data.petDebugScene,
      petDebugEscalation: d.escalation != null ? d.escalation : this.data.petDebugEscalation,
      petDebugAppState: d.appState || this.data.petDebugAppState,
      petDebugDoneBand: d.doneBand != null ? d.doneBand : this.data.petDebugDoneBand,
      petDebugForceClip: d.forceClip != null ? d.forceClip : this.data.petDebugForceClip,
    };
    this.setData(patch, () => {
      this.refresh();
      if (d.triggerRoam) {
        wx.nextTick(() => {
          const cat = this.selectComponent('#homeCat');
          if (cat && cat.triggerRoam) cat.triggerRoam();
        });
      }
    });
  },

  onPetDebugAction(e) {
    if (!isDevelopEnv()) return;
    const cat = this.selectComponent('#homeCat');
    if (!cat) return;
    const type = e.detail && e.detail.type;
    if (type === 'roam') {
      if (!cat.triggerRoam || !cat.triggerRoam()) {
        wx.showToast({ title: '当前不可漫游', icon: 'none' });
      }
    } else if (type === 'tap') {
      if (cat.clearTapCooldown) cat.clearTapCooldown();
      if (cat.simulateTap) cat.simulateTap();
    } else if (type === 'patrol' && cat.debugInjectExcitedPatrol) {
      cat.debugInjectExcitedPatrol();
    }
  },

  onPetDebugChange(e) {
    if (!this.data.petDebugOpen) return;
    this.setData({ petDebugInfo: e.detail });
  },

  // 节假日表按年份缓存，避免每秒刷新重复合并。
  getHolidayMap(now = new Date()) {
    const year = now.getFullYear();
    if (this._holidayYear !== year || !this._holidayMap) {
      this._holidayMap = getHolidayMapForYears([year, year + 1]);
      this._holidayYear = year;
    }
    return this._holidayMap;
  },

  onStartWork() {
    startWork();
    this.refresh();
  },

  // 休息日 / 法定节假日：用户主动「今天要上班」，选择倍数加班费或调休。
  onWorkOnRestDay() {
    const { premiumMultiplier, dayType, restDayKind } = this.data;
    const kindLabel = restDayKind === 'holiday' ? '恩假' : '休沐';
    wx.showActionSheet({
      itemList: [`认命，按 ${premiumMultiplier} 倍拿自愿卷薪`, '记白干，今天的命白搭'],
      success: (res) => {
        const compLeave = res.tapIndex === 1;
        startWork({ dayType, compLeave });
        wx.showToast({
          title: compLeave ? `${kindLabel}开卷 · 已记白干` : `${kindLabel}自愿卷 · ${premiumMultiplier}× 计薪`,
          icon: 'none',
        });
        this.refresh();
      },
    });
  },

  onClockOut() {
    if (this.data.ritualActive) return;
    const result = clockOut();
    if (!result) {
      wx.showToast({ title: '都还没开卷，跑什么路', icon: 'none' });
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
    wx.showToast({ title: '跑路成功', icon: 'success' });
  },

  onShareAppMessage() {
    const path = this.data.shareImagePath;
    const payload = this.data.sharePayload;
    if (path && payload) {
      return {
        title: `今日血汗变现 ¥${payload.earned}，离老板的法拉利又近了一寸`,
        path: '/pages/home/index',
        imageUrl: path,
      };
    }
    return { title: '薪时宝 · 今天的社畜生涯告一段落', path: '/pages/home/index' };
  },
});
