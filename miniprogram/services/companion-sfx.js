const { PET_SFX_ENABLED_KEY } = require('../constants/storage-keys');

const SFX_MAP = {
  meow_soft: '/assets/sound/meow_soft.mp3',
  meow_mid: '/assets/sound/meow_mid.mp3',
  meow_loud: '/assets/sound/meow_loud.mp3',
};

function isPetSfxEnabled() {
  if (typeof wx === 'undefined') return true;
  const v = wx.getStorageSync(PET_SFX_ENABLED_KEY);
  if (v === '' || v === undefined || v === null) return true;
  return !!v;
}

function playCompanionSfx(id, probability = 1) {
  if (!id || !SFX_MAP[id] || !isPetSfxEnabled()) return;
  if (probability < 1 && Math.random() > probability) return;

  if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[companion-sfx]', id);
    }
    return;
  }

  const ctx = wx.createInnerAudioContext();
  ctx.src = SFX_MAP[id];
  ctx.onEnded(() => {
    ctx.destroy();
  });
  ctx.onError(() => {
    ctx.destroy();
  });
  ctx.play();
}

module.exports = {
  isPetSfxEnabled,
  playCompanionSfx,
};
