const assert = require('assert');

const storage = {};
let callCount = 0;
let networkType = 'wifi';
let cloudShouldFail = false;

global.wx = {
  getStorageSync: (key) => storage[key],
  setStorageSync: (key, val) => {
    storage[key] = val;
  },
  removeStorageSync: (key) => {
    delete storage[key];
  },
  getNetworkType: ({ success }) => success({ networkType }),
  login: ({ success }) => success({ code: 'mock' }),
  cloud: {
    callFunction: ({ success, fail }) => {
      callCount += 1;
      if (cloudShouldFail) {
        fail(new Error('cloud fail'));
        return;
      }
      success({ result: { settings: null, records: null } });
    },
  },
};

storage.xsb_settings = {
  monthlySalary: 10000,
  cloudSyncEnabled: true,
  updatedAt: 100,
};

const sync = require('../../miniprogram/services/sync');

(async () => {
  networkType = 'none';
  callCount = 0;
  sync.setSessionOpenId('test-open-id');
  await sync.syncNow();
  assert.strictEqual(callCount, 0);

  networkType = 'wifi';
  cloudShouldFail = false;
  callCount = 0;
  await sync.syncNow();
  assert.ok(callCount >= 1);

  cloudShouldFail = true;
  callCount = 0;
  await sync.syncNow();
  assert.ok(callCount >= 3);

  assert.strictEqual(sync.formatLastSyncDisplay(null), '尚未同步');

  console.log('sync.test.js: ok');
})();
