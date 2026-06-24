// app.js
const { envList } = require('./envList');
const { clearDevStorageIfRelease } = require('./utils/dev-storage');

App({
  onLaunch() {
    clearDevStorageIfRelease();
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.globalData = {
      env: envList[0]?.envId || '',
      statusBarHeight: win.statusBarHeight || 44,
      safeBottom: win.safeArea ? win.screenHeight - win.safeArea.bottom : 0,
      editRecordDate: null,
    };
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else if (this.globalData.env) {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
      // 静默刷新法定节假日数据（失败降级到内置数据，不阻塞启动）
      try {
        require('./services/holidays').refreshHolidaysSilently();
      } catch (_) {}
    }
  },

  onShow() {
    const { getSettings } = require('./services/settings');
    if (getSettings().cloudSyncEnabled) {
      require('./services/sync').scheduleSync();
    }
  },
});
