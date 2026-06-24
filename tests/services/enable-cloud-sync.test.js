const assert = require('assert');

const storage = {};
let getOpenIdResult = { openid: 'test-open-id' };

global.wx = {
  getStorageSync: (key) => storage[key],
  setStorageSync: (key, val) => {
    storage[key] = val;
  },
  removeStorageSync: (key) => {
    delete storage[key];
  },
  getNetworkType: ({ success }) => success({ networkType: 'wifi' }),
  login: ({ success }) => success({ code: 'mock' }),
  cloud: {
    callFunction: ({ data, success, fail }) => {
      if (data && data.action === 'getOpenId') {
        success({ result: getOpenIdResult });
        return;
      }
      success({ result: { settings: null, records: null } });
    },
  },
};

const { getSettings, saveSettings } = require('../../miniprogram/services/settings');

storage.xsb_settings = {
  monthlySalary: 10000,
  cloudSyncEnabled: false,
  updatedAt: 100,
};

delete require.cache[require.resolve('../../miniprogram/services/sync')];
const sync = require('../../miniprogram/services/sync');

(async () => {
  getOpenIdResult = { openid: 'oid-1' };
  await sync.enableCloudSync();
  assert.strictEqual(getSettings().cloudSyncEnabled, true);
  assert.strictEqual(sync.getSessionOpenId(), 'oid-1');

  saveSettings({ cloudSyncEnabled: false });
  sync.clearSessionOpenId();
  getOpenIdResult = { error: 'NO_OPENID' };
  let threw = false;
  try {
    await sync.enableCloudSync();
  } catch (e) {
    threw = true;
    assert.strictEqual(e.message, 'NO_OPENID');
  }
  assert.ok(threw);
  assert.strictEqual(getSettings().cloudSyncEnabled, false);

  console.log('enable-cloud-sync.test.js: ok');
})();
