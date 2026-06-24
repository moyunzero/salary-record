function canUse(api) {
  return typeof wx !== 'undefined' && typeof wx.canIUse === 'function' && wx.canIUse(api);
}

function vibrateShort(type = 'medium') {
  if (!canUse('vibrateShort')) return;
  wx.vibrateShort({ type, fail() {} });
}

function previewImageFallback(filePath, hint) {
  if (!canUse('previewImage')) return false;
  wx.previewImage({ urls: [filePath], current: filePath });
  wx.showToast({ title: hint || '长按图片可保存', icon: 'none' });
  return true;
}

function shareUnavailableHint() {
  const content = '当前环境暂不支持一键分享，请使用右上角 ··· → 转发。';
  if (wx.showModal) {
    wx.showModal({ title: '分享提示', content, showCancel: false });
  } else {
    wx.showToast({ title: '请用右上角转发', icon: 'none' });
  }
}

function saveImageToAlbum(filePath) {
  if (!filePath) return;

  const doSave = () => {
    if (!canUse('saveImageToPhotosAlbum')) {
      previewImageFallback(filePath, '长按图片可保存');
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: () => previewImageFallback(filePath, '长按图片可保存'),
    });
  };

  if (!canUse('getSetting')) {
    doSave();
    return;
  }

  wx.getSetting({
    success: (res) => {
      if (res.authSetting && res.authSetting['scope.writePhotosAlbum']) {
        doSave();
        return;
      }
      if (!canUse('authorize')) {
        doSave();
        return;
      }
      wx.authorize({
        scope: 'scope.writePhotosAlbum',
        success: doSave,
        fail: () => previewImageFallback(filePath, '长按图片可保存'),
      });
    },
    fail: () => doSave(),
  });
}

function shareImage(filePath) {
  if (!filePath) return;

  if (typeof wx.showShareImageMenu === 'function') {
    wx.showShareImageMenu({
      path: filePath,
      success: () => {},
      fail: () => shareUnavailableHint(),
    });
    return;
  }

  shareUnavailableHint();
}

module.exports = {
  vibrateShort,
  saveImageToAlbum,
  shareImage,
  canUse,
};
