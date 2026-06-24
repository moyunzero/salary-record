const assert = require('assert');

// 无 wx 环境：readCache 应被 try/catch 兜住，回退到内置数据
const { getHolidayMap, getHolidayMapForYears, bundledMap } = require('../../miniprogram/services/holidays');

const map2026 = getHolidayMap(2026);
assert.ok(map2026['2026-10-01'], '内置 2026 含国庆');
assert.strictEqual(map2026['2026-10-01'].type, 'public_holiday');
assert.strictEqual(map2026['2026-10-01'].name, '国庆节');
assert.strictEqual(map2026['2026-10-10'].type, 'transfer_workday', '国庆补班为调休工作日');

// 未知年份 → 空对象（不抛错）
assert.deepStrictEqual(bundledMap(2099), {});

// 合并多年
const merged = getHolidayMapForYears([2025, 2026]);
assert.ok(merged['2025-01-01'] && merged['2026-01-01'], '跨年合并');

console.log('holidays.test.js: ok');
