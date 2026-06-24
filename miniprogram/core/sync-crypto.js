const CryptoJS = require('../vendor/crypto-js');
const { APP_SALT } = require('../constants/sync');

function deriveKey(openId) {
  return CryptoJS.SHA256(`${openId}:${APP_SALT}`).toString(CryptoJS.enc.Hex);
}

function settingsForSync(settings) {
  const { cloudSyncEnabled, updatedAt, ...rest } = settings || {};
  return rest;
}

function encryptPayload(openId, obj) {
  return CryptoJS.AES.encrypt(JSON.stringify(obj), deriveKey(openId)).toString();
}

function decryptPayload(openId, cipher) {
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, deriveKey(openId));
    const text = bytes.toString(CryptoJS.enc.Utf8);
    if (!text) return null;
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

module.exports = {
  deriveKey,
  settingsForSync,
  encryptPayload,
  decryptPayload,
};
