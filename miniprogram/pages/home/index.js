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
const { defaultWorkSchedule } = require('../../core/work-schedule');
const { CROSS_DAY_DEFER_KEY } = require('../../constants/storage-keys');
const CAT_ATLAS = require('../../assets/cat-pet/cat1-atlas-data.js');

const PET_DEBUG_SCENARIOS = [
  { id: 'beforeWork', label: '上班前', scene: 'beforeWork', escalation: 0, appState: 'idle' },
  { id: 'offDuty', label: '闲暇', scene: 'offDuty', escalation: 0, appState: 'idle' },
  { id: 'onShift', label: '上班中', scene: 'onShift', escalation: 0, appState: 'working' },
  { id: 'lunch', label: '午休', scene: 'lunch', escalation: 0, appState: 'idle' },
  { id: 'dinner', label: '晚休', scene: 'dinner', escalation: 0, appState: 'idle' },
  { id: 'nightShift', label: '晚班', scene: 'nightShift', escalation: 0, appState: 'working' },
  { id: 'otL1', label: '加班 L1', scene: 'overtime', escalation: 1, appState: 'working' },
  { id: 'otL2', label: '加班 L2', scene: 'overtime', escalation: 2, appState: 'working' },
  { id: 'otL3', label: '加班 L3', scene: 'overtime', escalation: 3, appState: 'working' },
  { id: 'otL4', label: '加班 L4', scene: 'overtime', escalation: 4, appState: 'working' },
  { id: 'doneActive', label: '收工·傍晚', scene: 'done', escalation: 0, appState: 'done', doneBand: 'done-active' },
  { id: 'doneNight', label: '收工·深夜', scene: 'done', escalation: 0, appState: 'done', doneBand: 'done-night' },
];

const PET_DEBUG_SLEEP_CLIPS = [
  { clip: 'sleep1_l', label: 'sleep1 · 左' },
  { clip: 'sleep1_r', label: 'sleep1 · 右' },
  { clip: 'sleep2_l', label: 'sleep2 · 左' },
  { clip: 'sleep2_r', label: 'sleep2 · 右' },
  { clip: 'sleep3_l', label: 'sleep3 · 左' },
  { clip: 'sleep3_r', label: 'sleep3 · 右' },
  { clip: 'sleep4_l', label: 'sleep4 · 左' },
  { clip: 'sleep4_r', label: 'sleep4 · 右' },
];

const PET_DEBUG_MEOW_CLIPS = [
  { clip: 'meow_sit', label: 'meow · 坐' },
  { clip: 'meow_stand', label: 'meow · 站' },
  { clip: 'meow_sit2', label: 'meow · 坐2' },
  { clip: 'meow_lie', label: 'meow · 趴' },
];

const PET_DEBUG_YAWN_CLIPS = [
  { clip: 'yawn_sit', label: 'yawn · 坐' },
  { clip: 'yawn_stand', label: 'yawn · 站' },
  { clip: 'yawn_sit2', label: 'yawn · 坐2' },
  { clip: 'yawn_lie', label: 'yawn · 趴' },
];

const PET_DEBUG_WASH_CLIPS = [
  { clip: 'wash_sit', label: 'wash · 坐（9帧）' },
  { clip: 'wash_stand', label: 'wash · 站（9帧）' },
  { clip: 'wash_lie', label: 'wash · 趴（7帧）' },
];

const PET_DEBUG_SCRATCH_CLIPS = [
  { clip: 'scratch_l', label: 'scratch · 左（11帧）' },
  { clip: 'scratch_r', label: 'scratch · 右（11帧）' },
];

const PET_DEBUG_HISS_CLIPS = [
  { clip: 'hiss_l', label: 'hiss · 左（2帧）' },
  { clip: 'hiss_r', label: 'hiss · 右（2帧）' },
];

const PET_DEBUG_IDLE_CLIPS = [
  { clip: 'idle_a', label: 'idle · 33,35' },
  { clip: 'idle_b', label: 'idle · 34,36' },
];

const PET_DEBUG_PAW_CLIPS = [
  { clip: 'paw_attack_down', label: 'paw · 下（9帧）' },
  { clip: 'paw_attack_up', label: 'paw · 上（5帧）' },
  { clip: 'paw_attack_left', label: 'paw · 左（7帧）' },
  { clip: 'paw_attack_right', label: 'paw · 右（7帧）' },
  { clip: 'paw_attack_left_down', label: 'paw · 左下（9帧）' },
  { clip: 'paw_attack_right_down', label: 'paw · 右下（9帧）' },
  { clip: 'paw_attack_left_up', label: 'paw · 左上（5帧）' },
  { clip: 'paw_attack_right_up', label: 'paw · 右上（5帧）' },
];

const PET_DEBUG_GROUPED_CLIP_IDS = new Set([
  ...PET_DEBUG_SLEEP_CLIPS.map((item) => item.clip),
  ...PET_DEBUG_MEOW_CLIPS.map((item) => item.clip),
  ...PET_DEBUG_YAWN_CLIPS.map((item) => item.clip),
  ...PET_DEBUG_WASH_CLIPS.map((item) => item.clip),
  ...PET_DEBUG_SCRATCH_CLIPS.map((item) => item.clip),
  ...PET_DEBUG_HISS_CLIPS.map((item) => item.clip),
  ...PET_DEBUG_IDLE_CLIPS.map((item) => item.clip),
  ...PET_DEBUG_PAW_CLIPS.map((item) => item.clip),
]);

const PET_DEBUG_CLIPS = Object.keys(CAT_ATLAS.clips || {})
  .filter((key) => !PET_DEBUG_GROUPED_CLIP_IDS.has(key))
  .sort();

function isDevelopEnv() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion === 'develop';
  } catch (e) {
    return false;
  }
}

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
    petDebugInfo: {
      clip: '',
      frame: 0,
      frameCount: 0,
      overlay: false,
      scene: '',
      escalation: 0,
      appState: 'idle',
      forced: false,
    },
    petDebugScenarios: PET_DEBUG_SCENARIOS,
    petDebugSleepClips: PET_DEBUG_SLEEP_CLIPS,
    petDebugMeowClips: PET_DEBUG_MEOW_CLIPS,
    petDebugYawnClips: PET_DEBUG_YAWN_CLIPS,
    petDebugWashClips: PET_DEBUG_WASH_CLIPS,
    petDebugScratchClips: PET_DEBUG_SCRATCH_CLIPS,
    petDebugHissClips: PET_DEBUG_HISS_CLIPS,
    petDebugIdleClips: PET_DEBUG_IDLE_CLIPS,
    petDebugPawClips: PET_DEBUG_PAW_CLIPS,
    petDebugClips: PET_DEBUG_CLIPS,
    petDebugLiveContext: 'beforeWork',
    petDebugLiveEscalation: 0,
    petDebugEnabled: false,
    petDockTop: 400,
    petDockHeight: 0,
    petDebugPanelBottom: 200,
  },

  _timer: null,
  _redirecting: false,
  _petDockTop: 0,
  _petDockHeight: 0,

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
      .exec((res) => {
        const topAnchor = res && res[0];
        if (!topAnchor || topAnchor.top <= 0) return;

        const top = topAnchor.top;
        const height = Math.round(win.windowHeight - top);
        const panelBottom = Math.max(72, Math.round(win.windowHeight - top + 8));

        if (this._petDockTop === top && this._petDockHeight === height) return;
        if (height < 72) return;

        this._petDockTop = top;
        this._petDockHeight = height;
        this.setData({ petDockTop: top, petDockHeight: height, petDebugPanelBottom: panelBottom });
        wx.nextTick(() => {
          const cat = this.selectComponent('#homeCat');
          if (cat && cat.measureStage) cat.measureStage();
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

  onPetDebugToggle() {
    if (!isDevelopEnv()) return;
    const open = !this.data.petDebugOpen;
    this.setData({ petDebugOpen: open }, () => {
      if (open) wx.nextTick(() => this.measurePetDock());
    });
  },

  noop() {},

  onPetDebugClose() {
    this.setData({ petDebugOpen: false });
  },

  onPetDebugSelectScenario(e) {
    const { id } = e.currentTarget.dataset;
    const scenario = PET_DEBUG_SCENARIOS.find((s) => s.id === id);
    if (!scenario) return;

    this.setData({
      petDebugActive: true,
      petDebugOpen: true,
      petDebugScenarioId: scenario.id,
      petDebugScene: scenario.scene,
      petDebugEscalation: scenario.escalation,
      petDebugAppState: scenario.appState,
      petDebugDoneBand: scenario.doneBand || '',
      petDebugForceClip: '',
    });
    this.refresh();
    wx.nextTick(() => {
      const cat = this.selectComponent('#homeCat');
      if (cat && cat.triggerRoam) cat.triggerRoam();
    });
  },

  onPetDebugSelectClip(e) {
    const { clip } = e.currentTarget.dataset;
    if (!clip) return;

    this.setData({
      petDebugActive: true,
      petDebugOpen: true,
      petDebugScenarioId: '',
      petDebugForceClip: clip,
    });
    this.refresh();
  },

  onPetDebugTriggerRoam() {
    const cat = this.selectComponent('#homeCat');
    if (!cat || !cat.triggerRoam) return;
    if (!cat.triggerRoam()) {
      wx.showToast({ title: '当前不可漫游', icon: 'none' });
    }
  },

  onPetDebugSimulateTap() {
    const cat = this.selectComponent('#homeCat');
    if (cat && cat.clearTapCooldown) cat.clearTapCooldown();
    if (cat && cat.simulateTap) cat.simulateTap();
  },

  onPetDebugInjectPatrol() {
    if (!isDevelopEnv()) return;
    const cat = this.selectComponent('#homeCat');
    if (cat && cat.debugInjectExcitedPatrol) cat.debugInjectExcitedPatrol();
  },

  onPetDebugReset() {
    this.setData({
      petDebugActive: false,
      petDebugScenarioId: '',
      petDebugForceClip: '',
      petDebugScene: 'beforeWork',
      petDebugEscalation: 0,
      petDebugAppState: 'idle',
      petDebugDoneBand: '',
    });
    this.refresh();
  },

  onPetDebugChange(e) {
    if (!this.data.petDebugOpen) return;
    this.setData({ petDebugInfo: e.detail });
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
