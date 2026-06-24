const assert = require('assert');
const {
  deriveKey,
  settingsForSync,
  encryptPayload,
  decryptPayload,
} = require('../../miniprogram/core/sync-crypto');

const openId = 'test-open-id-123';

assert.ok(deriveKey(openId).length === 64);

const sample = {
  monthlySalary: 15000,
  cloudSyncEnabled: true,
  updatedAt: 999,
  standardHoursPerDay: 8,
};
const stripped = settingsForSync(sample);
assert.strictEqual(stripped.cloudSyncEnabled, undefined);
assert.strictEqual(stripped.updatedAt, undefined);
assert.strictEqual(stripped.monthlySalary, 15000);

const cipher = encryptPayload(openId, { foo: 'bar', n: 42 });
const plain = decryptPayload(openId, cipher);
assert.deepStrictEqual(plain, { foo: 'bar', n: 42 });

assert.strictEqual(decryptPayload(openId, 'bad-cipher'), null);

console.log('sync-crypto.test.js: ok');
