/** 猫猫活动区下界与 Tab 栏之间的视觉间距（与上界 10rpx 对称） */

function petDockBottomGapPx(win) {
  const info = win || (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
  const ww = info.windowWidth || 375;
  return Math.round((10 / 750) * ww);
}

module.exports = { petDockBottomGapPx };
