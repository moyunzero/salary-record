const { SYNC_FUNCTION_NAME, RETRY_DELAYS_MS } = require('../constants/sync');
const { LAST_SYNC_KEY } = require('../constants/storage-keys');
const { encryptPayload, decryptPayload, settingsForSync } = require('../core/sync-crypto');
const { mergeSettings, mergeAllRecords, maxRecordUpdatedAt } = require('../core/sync-merge');
const { getSettings, saveSettings } = require('./settings');
const {
  getAllRecordsIncludingTombstones,
  applyRecordsForSync,
} = require('./clock');

let _sessionOpenId = null;
let _syncTimer = null;
let _lastSyncError = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setSessionOpenId(openId) {
  _sessionOpenId = openId || null;
}

function clearSessionOpenId() {
  _sessionOpenId = null;
}

function getSessionOpenId() {
  return _sessionOpenId;
}

function isOnline() {
  return new Promise((resolve) => {
    wx.getNetworkType({
      success: (res) => resolve(res.networkType !== 'none'),
      fail: () => resolve(false),
    });
  });
}

async function withRetry(fn, attempts = 3, delays = RETRY_DELAYS_MS) {
  _lastSyncError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      _lastSyncError = err;
      if (i === attempts - 1) return null;
      await sleep(delays[i] || 1000);
    }
  }
  return null;
}

function getLastSyncAt() {
  return wx.getStorageSync(LAST_SYNC_KEY) || null;
}

function setLastSyncAt(ts) {
  wx.setStorageSync(LAST_SYNC_KEY, ts);
}

function formatLastSyncDisplay(ts) {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function callSync(action, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: SYNC_FUNCTION_NAME,
      data: { action, ...data },
      success: (res) => resolve(res.result),
      fail: (err) => {
        const wrapped = err || new Error('CLOUD_CALL_FAILED');
        wrapped.cloudSyncHint = formatCloudSyncError(wrapped);
        reject(wrapped);
      },
    });
  });
}

function formatCloudSyncError(err) {
  const msg = `${err?.errMsg || ''} ${err?.message || ''} ${String(err)}`;
  if (msg.includes('FUNCTION_NOT_FOUND') || msg.includes('-501000')) {
    return '请先在开发者工具上传并部署云函数 sync';
  }
  if (msg.includes('-502005') || /collection not exist|DATABASE_COLLECTION/i.test(msg)) {
    return '云数据库集合未就绪，请重新部署 sync 云函数后重试';
  }
  if (/timeout|SYNC_FAILED/i.test(msg)) {
    return '云开发连接超时，请检查网络、云环境并重部署 sync';
  }
  return '云端备份失败，请稍后再试';
}

function makeSyncError(code) {
  const err = new Error(code);
  err.cloudSyncHint = formatCloudSyncError(_lastSyncError || err);
  return err;
}

function scheduleSync() {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    syncNow();
  }, 300);
}

async function ensureSession() {
  if (_sessionOpenId) return true;
  if (!getSettings().cloudSyncEnabled) return false;
  try {
    await wxLogin();
    const result = await callSync('getOpenId');
    if (result && result.openid) {
      setSessionOpenId(result.openid);
      return true;
    }
  } catch (_) {}
  return false;
}

async function syncNow() {
  if (!getSettings().cloudSyncEnabled) return null;
  if (!(await ensureSession())) return null;
  if (!(await isOnline())) return null;

  return withRetry(async () => {
    const openId = _sessionOpenId;
    const pullResult = await callSync('pull');
    if (pullResult && pullResult.error) throw new Error(pullResult.error);

    let localSettings = getSettings();
    let localRecords = getAllRecordsIncludingTombstones();
    const localSettingsUpdatedAt = localSettings.updatedAt || 0;
    const localRecordsUpdatedAt = maxRecordUpdatedAt(localRecords);

    let cloudSettings = null;
    let cloudSettingsUpdatedAt = 0;
    let cloudRecords = null;
    let cloudRecordsUpdatedAt = 0;

    if (pullResult && pullResult.settings && pullResult.settings.payload) {
      cloudSettingsUpdatedAt = pullResult.settings.updatedAt || 0;
      cloudSettings = decryptPayload(openId, pullResult.settings.payload);
    }
    if (pullResult && pullResult.records && pullResult.records.payload) {
      cloudRecordsUpdatedAt = pullResult.records.updatedAt || 0;
      cloudRecords = decryptPayload(openId, pullResult.records.payload);
    }

    const mergedSettings = mergeSettings(
      localSettings,
      localSettingsUpdatedAt,
      cloudSettings,
      cloudSettingsUpdatedAt
    );
    const mergedAllRecords = mergeAllRecords(localRecords, cloudRecords || []);

    const cloudSyncEnabled = localSettings.cloudSyncEnabled;
    saveSettings({ ...mergedSettings, cloudSyncEnabled }, { skipSchedule: true });
    applyRecordsForSync(mergedAllRecords);

    localSettings = getSettings();
    localRecords = getAllRecordsIncludingTombstones();
    const pushPayload = {};
    const nowSettingsUpdatedAt = localSettings.updatedAt || 0;
    const nowRecordsUpdatedAt = maxRecordUpdatedAt(localRecords);

    if (nowSettingsUpdatedAt > cloudSettingsUpdatedAt) {
      pushPayload.settings = {
        payload: encryptPayload(openId, settingsForSync(localSettings)),
        updatedAt: nowSettingsUpdatedAt,
      };
    }
    if (nowRecordsUpdatedAt > cloudRecordsUpdatedAt) {
      pushPayload.records = {
        payload: encryptPayload(openId, localRecords),
        updatedAt: nowRecordsUpdatedAt,
      };
    }

    if (pushPayload.settings || pushPayload.records) {
      const pushResult = await callSync('push', pushPayload);
      if (pushResult && pushResult.error) throw new Error(pushResult.error);
    }

    const syncedAt = Date.now();
    const stamped = localRecords.map((r) =>
      r.syncedAt == null ? { ...r, syncedAt } : r
    );
    applyRecordsForSync(stamped);
    setLastSyncAt(Date.now());
    return true;
  });
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject });
  });
}

async function enableCloudSync() {
  await wxLogin();
  const result = await callSync('getOpenId');
  if (!result || result.error || !result.openid) {
    const err = new Error(result?.error || 'NO_OPENID');
    err.cloudSyncHint = formatCloudSyncError(err);
    throw err;
  }
  setSessionOpenId(result.openid);
  try {
    await callSync('init');
  } catch (_) {}
  saveSettings({ cloudSyncEnabled: true });
  const ok = await syncNow();
  if (!ok) {
    saveSettings({ cloudSyncEnabled: false });
    clearSessionOpenId();
    throw makeSyncError('SYNC_FAILED');
  }
}

function disableCloudSync() {
  saveSettings({ cloudSyncEnabled: false });
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
  }
}

function logoutCloudSession() {
  clearSessionOpenId();
  saveSettings({ cloudSyncEnabled: false });
  wx.removeStorageSync(LAST_SYNC_KEY);
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
  }
}

module.exports = {
  scheduleSync,
  syncNow,
  enableCloudSync,
  disableCloudSync,
  logoutCloudSession,
  getLastSyncAt,
  formatLastSyncDisplay,
  formatCloudSyncError,
  getSessionOpenId,
  setSessionOpenId,
  clearSessionOpenId,
};
