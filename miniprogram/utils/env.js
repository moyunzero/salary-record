/** 运行环境判断：正式版不暴露开发调试能力 */

function getEnvVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion || 'release';
  } catch (e) {
    return 'release';
  }
}

function isDevelopEnv() {
  return getEnvVersion() === 'develop';
}

function isTrialEnv() {
  return getEnvVersion() === 'trial';
}

function isReleaseEnv() {
  return getEnvVersion() === 'release';
}

module.exports = {
  getEnvVersion,
  isDevelopEnv,
  isTrialEnv,
  isReleaseEnv,
};
