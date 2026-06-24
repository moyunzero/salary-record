const { DEV_MOCK_OVERTIME_KEY, DEV_MOCK_OVERTIME_OFFSET_KEY } = require('../constants/storage-keys');
const { isReleaseEnv } = require('./env');

/** 正式版启动时清除开发调试遗留的本地存储 */
function clearDevStorageIfRelease() {
  if (!isReleaseEnv()) return;
  try {
    wx.removeStorageSync(DEV_MOCK_OVERTIME_KEY);
    wx.removeStorageSync(DEV_MOCK_OVERTIME_OFFSET_KEY);
  } catch (_) {
    /* ignore */
  }
}

module.exports = { clearDevStorageIfRelease };
