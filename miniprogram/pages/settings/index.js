const safeArea = require('../../behaviors/safe-area');
const { DEFAULT_INSURANCE, INSURANCE_PERSONAL_LIMITS, insuranceToPercent, percentToInsurance, clampInsurancePercent } = require('../../core/insurance');
const {
  defaultWorkSchedule,
  computeDailyWorkHours,
  validateWorkSchedule,
} = require('../../core/work-schedule');
const { getSettings, saveSettings } = require('../../services/settings');
const {
  enableCloudSync,
  disableCloudSync,
  logoutCloudSession,
  getLastSyncAt,
  formatLastSyncDisplay,
  formatCloudSyncError,
} = require('../../services/sync');
const { vibrateShort } = require('../../services/platform');
const { INSURANCE_PRESETS, WORK_PRESETS, roundPercent } = require('../../constants/presets');

const SCHEDULE_ERRORS = {
  overlap: '时间段有重叠',
  invalid_block: '时间格式无效',
  invalid_schedule: '作息配置不完整',
  hours_out_of_range: '每日工时应为4–16小时',
};

Page({
  behaviors: [safeArea],

  data: {
    monthlySalary: '',
    standardHoursPerDay: 8,
    workDaysPerMonth: 21.75,
    workSchedule: defaultWorkSchedule(),
    nightShiftEnabled: false,
    autoStartEnabled: true,
    workWeekdays: [1, 2, 3, 4, 5],
    weekdayChips: [],
    restSystem: 'double_rest',
    isBigSmall: false,
    bigSmall: { anchorWeekDate: '', anchorType: 'big' },
    holidayAutoRest: true,
    compLeaveBalance: 0,
    computedStandardHours: 8,
    insurancePercent: {
      pension: 8,
      medical: 2,
      unemployment: 0.5,
      fund: 12,
    },
    insurance: { ...DEFAULT_INSURANCE },
    insurancePresets: INSURANCE_PRESETS,
    insuranceLimits: INSURANCE_PERSONAL_LIMITS,
    workPresets: WORK_PRESETS,
    selectedInsurancePreset: 'national_common',
    selectedWorkPreset: 'legal_double_rest',
    insuranceFineTuneOpen: false,
    workFineTuneOpen: false,
    canSave: false,
    cloudSyncEnabled: false,
    lastSyncDisplay: '',
    pageReady: false,
  },

  onBack() {
    wx.navigateBack();
  },

  refreshCloudSyncUI() {
    const s = getSettings();
    this.setData({
      cloudSyncEnabled: !!s.cloudSyncEnabled,
      lastSyncDisplay: s.cloudSyncEnabled ? formatLastSyncDisplay(getLastSyncAt()) : '',
    });
  },

  onShow() {
    if (!this.data.pageReady) {
      this.setData({ pageReady: true });
    }
    const s = getSettings();
    if (this._settingsUpdatedAt !== s.updatedAt) {
      this.loadFormFromSettings();
      this._settingsUpdatedAt = s.updatedAt;
    }
    this.refreshCloudSyncUI();
  },

  onToggleCloudSync(e) {
    const checked = e.detail.value;
    if (checked) {
      wx.showModal({
        title: '开启云端备份',
        content: '工资与工时数据将以 AES 加密备份到微信云开发，仅你本人可解密查看。',
        confirmText: '开启',
        cancelText: '取消',
        success: async (res) => {
          if (res.confirm) {
            this.setData({ cloudSyncEnabled: true });
            try {
              await enableCloudSync();
              this.refreshCloudSyncUI();
            } catch (err) {
              console.error('[cloud-sync] enable failed:', err);
              this.setData({ cloudSyncEnabled: false });
              wx.showToast({
                title: err.cloudSyncHint || formatCloudSyncError(err),
                icon: 'none',
                duration: 3500,
              });
            }
          } else {
            this.setData({ cloudSyncEnabled: false });
          }
        },
      });
      return;
    }
    wx.showModal({
      title: '关闭云端备份',
      content: '本地数据保留，云端备份保留但不再更新。',
      confirmText: '关闭',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          disableCloudSync();
          this.refreshCloudSyncUI();
        } else {
          this.setData({ cloudSyncEnabled: true });
        }
      },
    });
  },

  onLogoutCloud() {
    wx.showModal({
      title: '退出登录',
      content: '将断开云备份关联，本地工时与设置不会删除。',
      confirmText: '退出',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          logoutCloudSession();
          this.refreshCloudSyncUI();
        }
      },
    });
  },

  buildWeekdayChips(restSystem) {
    const labels = ['日', '一', '二', '三', '四', '五', '六'];
    const work = this.deriveWorkWeekdays(restSystem);
    return labels.map((label, day) => {
      let status = work.includes(day) ? 'work' : 'rest';
      if (restSystem === 'big_small_week' && day === 6) status = 'alt'; // 周六大小周交替
      return { day, label, status };
    });
  },

  // 由工作制推导每周工作日（仅用于展示；大小周周六交替单独处理）
  deriveWorkWeekdays(restSystem) {
    if (restSystem === 'single_rest') return [1, 2, 3, 4, 5, 6];
    if (restSystem === 'big_small_week') return [1, 2, 3, 4, 5, 6];
    return [1, 2, 3, 4, 5];
  },

  mondayStr(now = new Date()) {
    const dow = now.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    const p = (n) => String(n).padStart(2, '0');
    return `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`;
  },

  onLoad() {
    this.loadFormFromSettings();
  },

  loadFormFromSettings() {
    const s = getSettings();
    const workSchedule = s.workSchedule || defaultWorkSchedule(s.workStartTime);
    const nightShiftEnabled = !!s.nightShiftEnabled;
    const restSystem = s.restSystem || 'double_rest';
    const workWeekdays = this.deriveWorkWeekdays(restSystem);
    const presetByRest = {
      double_rest: 'legal_double_rest',
      single_rest: 'single_rest',
      big_small_week: 'big_small_week',
    };
    const bigSmall = s.bigSmall && typeof s.bigSmall === 'object'
      ? { anchorWeekDate: s.bigSmall.anchorWeekDate || '', anchorType: s.bigSmall.anchorType === 'small' ? 'small' : 'big' }
      : { anchorWeekDate: '', anchorType: 'big' };
    this.setData({
      monthlySalary: String(s.monthlySalary || ''),
      standardHoursPerDay: s.standardHoursPerDay,
      workDaysPerMonth: s.workDaysPerMonth,
      workSchedule,
      nightShiftEnabled,
      autoStartEnabled: s.autoStartEnabled !== false,
      restSystem,
      isBigSmall: restSystem === 'big_small_week',
      bigSmall,
      holidayAutoRest: s.holidayAutoRest !== false,
      compLeaveBalance: Number(s.compLeaveBalance) || 0,
      workWeekdays,
      weekdayChips: this.buildWeekdayChips(restSystem),
      selectedWorkPreset: presetByRest[restSystem] || 'custom',
      insurance: s.insurance,
      insurancePercent: insuranceToPercent(s.insurance),
      selectedInsurancePreset: 'custom',
    });
    this.recomputeComputedHours();
    this.updateCanSave();
    this.refreshCloudSyncUI();
    this._settingsUpdatedAt = s.updatedAt;
  },

  recomputeComputedHours() {
    const hours = computeDailyWorkHours(this.data.workSchedule, this.data.nightShiftEnabled);
    this.setData({ computedStandardHours: Math.round(hours * 10) / 10 });
  },

  updateScheduleField(path, value) {
    this.setData(
      {
        [path]: value,
        selectedWorkPreset: 'custom',
      },
      () => this.recomputeComputedHours()
    );
  },

  onMorningStart(e) {
    this.updateScheduleField('workSchedule.morning.start', e.detail.value);
  },

  onMorningEnd(e) {
    this.updateScheduleField('workSchedule.morning.end', e.detail.value);
  },

  onLunchStart(e) {
    this.updateScheduleField('workSchedule.lunch.start', e.detail.value);
  },

  onLunchEnd(e) {
    this.updateScheduleField('workSchedule.lunch.end', e.detail.value);
  },

  onAfternoonStart(e) {
    this.updateScheduleField('workSchedule.afternoon.start', e.detail.value);
  },

  onAfternoonEnd(e) {
    this.updateScheduleField('workSchedule.afternoon.end', e.detail.value);
  },

  onEveningRestStart(e) {
    this.updateScheduleField('workSchedule.eveningRest.start', e.detail.value);
  },

  onEveningRestEnd(e) {
    this.updateScheduleField('workSchedule.eveningRest.end', e.detail.value);
  },

  onNightWorkStart(e) {
    this.updateScheduleField('workSchedule.nightWork.start', e.detail.value);
  },

  onNightWorkEnd(e) {
    this.updateScheduleField('workSchedule.nightWork.end', e.detail.value);
  },

  onNightShiftToggle(e) {
    this.setData(
      {
        nightShiftEnabled: e.detail.value,
        selectedWorkPreset: 'custom',
      },
      () => this.recomputeComputedHours()
    );
  },

  onToggleAutoStart(e) {
    this.setData({ autoStartEnabled: e.detail.value });
  },

  onToggleHolidayAutoRest(e) {
    this.setData({ holidayAutoRest: e.detail.value });
  },

  // 大小周：标记本周为大周或小周（锚定到本周一）
  onSelectBigSmallType(e) {
    const anchorType = e.currentTarget.dataset.type === 'small' ? 'small' : 'big';
    this.setData({
      bigSmall: { anchorWeekDate: this.mondayStr(), anchorType },
    });
  },

  updateCanSave() {
    const salary = Number(this.data.monthlySalary);
    this.setData({ canSave: salary > 0 });
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
      () => this.updateCanSave()
    );
  },

  onSelectWorkPreset(e) {
    const id = e.currentTarget.dataset.id;
    const preset = WORK_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const restSystem = preset.restSystem || 'double_rest';
    const workWeekdays = this.deriveWorkWeekdays(restSystem);
    const updates = {
      selectedWorkPreset: id,
      standardHoursPerDay: preset.standardHoursPerDay,
      workDaysPerMonth: preset.workDaysPerMonth,
      restSystem,
      isBigSmall: restSystem === 'big_small_week',
      workWeekdays,
      weekdayChips: this.buildWeekdayChips(restSystem),
    };
    // 切到大小周且尚未设置锚点 → 默认本周为大周
    if (restSystem === 'big_small_week' && !this.data.bigSmall.anchorWeekDate) {
      updates.bigSmall = { anchorWeekDate: this.mondayStr(), anchorType: 'big' };
    }
    if (preset.workSchedule) {
      updates.workSchedule = JSON.parse(JSON.stringify(preset.workSchedule));
      if (preset.nightShiftEnabled !== undefined) {
        updates.nightShiftEnabled = preset.nightShiftEnabled;
      }
    }
    this.setData(updates, () => {
      this.recomputeComputedHours();
      this.updateCanSave();
    });
  },

  onSalaryInput(e) {
    this.setData({ monthlySalary: e.detail.value }, () => this.updateCanSave());
  },

  onWorkDays(e) {
    this.setData(
      {
        selectedWorkPreset: 'custom',
        workDaysPerMonth: roundPercent(Number(e.detail.value) || 21.75, 2),
      },
      () => this.updateCanSave()
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
      () => this.updateCanSave()
    );
  },

  toggleInsuranceFineTune() {
    this.setData({ insuranceFineTuneOpen: !this.data.insuranceFineTuneOpen });
  },

  toggleWorkFineTune() {
    this.setData({ workFineTuneOpen: !this.data.workFineTuneOpen });
  },

  onSave() {
    const salary = Number(this.data.monthlySalary);
    if (!salary || salary <= 0) {
      wx.showToast({ title: '卖身价填一个，总不能白卖命', icon: 'none' });
      return;
    }
    const scheduleResult = validateWorkSchedule(this.data.workSchedule, this.data.nightShiftEnabled);
    if (!scheduleResult.ok) {
      wx.showToast({
        title: SCHEDULE_ERRORS[scheduleResult.error] || '作息配置无效',
        icon: 'none',
      });
      return;
    }
    vibrateShort('light');
    const cloudOn = getSettings().cloudSyncEnabled;
    saveSettings(
      {
        monthlySalary: salary,
        standardHoursPerDay: scheduleResult.hours,
        workDaysPerMonth: this.data.workDaysPerMonth,
        insurance: this.data.insurance,
        workSchedule: this.data.workSchedule,
        nightShiftEnabled: this.data.nightShiftEnabled,
        workWeekdays: this.data.workWeekdays,
        autoStartEnabled: this.data.autoStartEnabled,
        restSystem: this.data.restSystem,
        bigSmall: this.data.bigSmall,
        holidayAutoRest: this.data.holidayAutoRest,
      },
      { skipSchedule: cloudOn }
    );
    wx.showToast({ title: '已保存 · 历史记录金额不变', icon: 'success' });
    if (cloudOn) {
      const { syncNow } = require('../../services/sync');
      syncNow().finally(() => this.refreshCloudSyncUI());
    }
  },
});
