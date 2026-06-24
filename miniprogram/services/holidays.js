// 节假日数据加载：内置静态数据兜底 + 本地缓存覆盖（云端刷新在 P4 接入）。
// 统一结构：{ 'YYYY-MM-DD': { type: 'public_holiday' | 'transfer_workday', name } }

const BUNDLED = {
  2025: require('../assets/holidays/CN-2025.js'),
  2026: require('../assets/holidays/CN-2026.js'),
};

const CACHE_PREFIX = 'holiday_cache_';

function bundledMap(year) {
  return BUNDLED[year] || {};
}

function readCache(year) {
  try {
    const cached = wx.getStorageSync(CACHE_PREFIX + year);
    if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
      return cached;
    }
  } catch (_) {}
  return null;
}

/**
 * 获取某年的节假日表：优先本地缓存（云端刷新结果），否则用内置数据兜底。
 * @param {number} year
 * @returns {Object<string,{type:string,name:string}>}
 */
function getHolidayMap(year) {
  return readCache(year) || bundledMap(year);
}

/**
 * 获取一组年份合并后的节假日表（跨年场景，如年底查询次年）。
 * @param {number[]} years
 * @returns {Object<string,{type:string,name:string}>}
 */
function getHolidayMapForYears(years) {
  const merged = {};
  for (const y of years) {
    Object.assign(merged, getHolidayMap(y));
  }
  return merged;
}

/**
 * 写入某年的节假日缓存（供云端刷新覆盖内置数据）。
 * @param {number} year
 * @param {Object} map
 */
function setHolidayCache(year, map) {
  if (!map || typeof map !== 'object') return;
  try {
    wx.setStorageSync(CACHE_PREFIX + year, map);
  } catch (_) {}
}

/**
 * 通过云函数刷新某年节假日并写入本地缓存（静默，失败降级到内置数据）。
 * @param {number} year
 * @returns {Promise<boolean>} 是否成功更新缓存
 */
function refreshHolidays(year) {
  return new Promise((resolve) => {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
      resolve(false);
      return;
    }
    wx.cloud.callFunction({
      name: 'getHolidays',
      data: { year },
      success: (res) => {
        const r = res && res.result;
        if (r && r.ok && r.map && Object.keys(r.map).length > 0) {
          setHolidayCache(year, r.map);
          resolve(true);
        } else {
          resolve(false);
        }
      },
      fail: () => resolve(false),
    });
  });
}

/** 启动时静默刷新：当年 + 年底预取次年。失败无副作用。 */
function refreshHolidaysSilently(now = new Date()) {
  const y = now.getFullYear();
  refreshHolidays(y);
  if (now.getMonth() >= 10) {
    refreshHolidays(y + 1);
  }
}

module.exports = {
  CACHE_PREFIX,
  bundledMap,
  getHolidayMap,
  getHolidayMapForYears,
  setHolidayCache,
  refreshHolidays,
  refreshHolidaysSilently,
};
