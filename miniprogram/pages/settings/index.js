const safeArea = require('../../behaviors/safe-area');
const { DEFAULT_INSURANCE } = require('../../core/insurance');
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
    computedStandardHours: 8,
    insurancePercent: {
      pension: 8,
      medical: 2,
      unemployment: 0.5,
      fund: 12,
    },
    insurance: { ...DEFAULT_INSURANCE },
    insurancePresets: INSURANCE_PRESETS,
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

  onLoad() {
    const s = getSettings();
    const workSchedule = s.workSchedule || defaultWorkSchedule(s.workStartTime);
    const nightShiftEnabled = !!s.nightShiftEnabled;
    this.setData({
      monthlySalary: String(s.monthlySalary || ''),
      standardHoursPerDay: s.standardHoursPerDay,
      workDaysPerMonth: s.workDaysPerMonth,
      workSchedule,
      nightShiftEnabled,
      insurance: s.insurance,
      insurancePercent: {
        pension: roundPercent((s.insurance.pension || 0) * 100, 1),
        medical: roundPercent((s.insurance.medical || 0) * 100, 1),
        unemployment: roundPercent((s.insurance.unemployment || 0) * 100, 2),
        fund: roundPercent((s.insurance.fund || 0) * 100, 1),
      },
      selectedInsurancePreset: 'custom',
      selectedWorkPreset: 'custom',
    });
    this.recomputeComputedHours();
    this.updateCanSave();
    this.refreshCloudSyncUI();
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
    const updates = {
      selectedWorkPreset: id,
      standardHoursPerDay: preset.standardHoursPerDay,
      workDaysPerMonth: preset.workDaysPerMonth,
    };
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
      wx.showToast({ title: '请输入有效月薪', icon: 'none' });
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
      },
      { skipSchedule: cloudOn }
    );
    wx.showToast({ title: '已保存', icon: 'success' });
    if (cloudOn) {
      const { syncNow } = require('../../services/sync');
      syncNow().finally(() => this.refreshCloudSyncUI());
    }
  },
});
