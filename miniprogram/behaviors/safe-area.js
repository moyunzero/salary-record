module.exports = Behavior({
  data: {
    statusBarHeight: 44,
    safeBottom: 0,
  },

  lifetimes: {
    attached() {
      const app = getApp();
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const statusBarHeight = app.globalData.statusBarHeight || win.statusBarHeight || 44;
      const safeBottom =
        app.globalData.safeBottom ??
        (win.safeArea ? win.screenHeight - win.safeArea.bottom : 0);
      this.setData({ statusBarHeight, safeBottom });
    },
  },
});
