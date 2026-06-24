const { PET_SFX_ENABLED_KEY } = require('../constants/storage-keys');
const { isDevelopEnv } = require('../utils/env');

const SFX_MAP = {
  meow_soft: '/assets/sound/meow_soft.mp3',
  meow_mid: '/assets/sound/meow_mid.mp3',
  meow_loud: '/assets/sound/meow_loud.mp3',
};

/** 旧 sfx id → 三档 meow（Launch 仅 bundled 三文件） */
const SFX_ALIASES = {
  meow: 'meow_mid',
  'nudge.yawn': 'meow_soft',
  wash: 'meow_soft',
  eat: 'meow_soft',
  sleep: 'meow_soft',
  paw: 'meow_mid',
  purr: 'meow_soft',
  scratch: 'meow_loud',
  hiss: 'meow_loud',
};

let audioOptionSet = false;

function isPetSfxEnabled() {
  if (typeof wx === 'undefined') return true;
  const v = wx.getStorageSync(PET_SFX_ENABLED_KEY);
  if (v === '' || v === undefined || v === null) return true;
  return !!v;
}

function resolveSfxId(id) {
  if (!id) return null;
  if (SFX_MAP[id]) return id;
  return SFX_ALIASES[id] || null;
}

function ensureAudioOptions() {
  if (audioOptionSet || typeof wx === 'undefined' || !wx.setInnerAudioOption) return;
  audioOptionSet = true;
  try {
    wx.setInnerAudioOption({
      obeyMuteSwitch: false,
      mixWithOther: true,
    });
  } catch (_) {
    /* ignore */
  }
}

function playCompanionSfx(id, probability = 1) {
  const resolved = resolveSfxId(id);
  if (!resolved || !isPetSfxEnabled()) return;
  if (probability < 1 && Math.random() > probability) return;

  if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
    if (isDevelopEnv() && typeof console !== 'undefined' && console.debug) {
      console.debug('[companion-sfx]', resolved);
    }
    return;
  }

  ensureAudioOptions();

  const ctx = wx.createInnerAudioContext();
  ctx.src = SFX_MAP[resolved];
  ctx.volume = 1;
  ctx.onEnded(() => {
    ctx.destroy();
  });
  ctx.onError((err) => {
    if (isDevelopEnv() && typeof console !== 'undefined' && console.warn) {
      console.warn('[companion-sfx] play error', resolved, err);
    }
    ctx.destroy();
  });
  ctx.play();
}

module.exports = {
  isPetSfxEnabled,
  resolveSfxId,
  playCompanionSfx,
};
