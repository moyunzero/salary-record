const assert = require('assert');
const { mergeSettings, mergeRecords, maxRecordUpdatedAt } = require('../../miniprogram/core/sync-merge');

const localSettings = { monthlySalary: 10000 };
const cloudSettings = { monthlySalary: 12000 };

assert.deepStrictEqual(mergeSettings(localSettings, 200, cloudSettings, 100), localSettings);
assert.deepStrictEqual(mergeSettings(localSettings, 50, cloudSettings, 100), cloudSettings);
assert.deepStrictEqual(mergeSettings(localSettings, 100, null, 0), localSettings);

const localRecords = [
  { id: 'a', date: '2026-06-20', updatedAt: 100, deleted: false },
  { id: 'b', date: '2026-06-21', updatedAt: 200, deleted: false },
];
const cloudRecords = [
  { id: 'a', date: '2026-06-20', updatedAt: 150, deleted: false },
  { id: 'c', date: '2026-06-22', updatedAt: 300, deleted: false },
];

const merged = mergeRecords(localRecords, cloudRecords);
assert.strictEqual(merged.length, 3);
assert.strictEqual(merged.find((r) => r.id === 'a').updatedAt, 150);

const tombLocal = [{ id: 'x', updatedAt: 500, deleted: true }];
const tombCloud = [{ id: 'x', updatedAt: 100, deleted: false, date: '2026-06-01' }];
assert.strictEqual(mergeRecords(tombLocal, tombCloud).length, 0);

assert.strictEqual(maxRecordUpdatedAt([{ updatedAt: 10 }, { updatedAt: 30 }]), 30);
assert.strictEqual(maxRecordUpdatedAt([]), 0);

console.log('sync-merge.test.js: ok');
