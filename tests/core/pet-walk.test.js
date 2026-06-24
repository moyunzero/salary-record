const assert = require('assert');
const {
  walkClipForRatioDelta,
  walkClipForPixelDelta,
  ratioDeltaToPixel,
} = require('../../miniprogram/core/pet-walk');

// 宽扁舞台（首页典型）：相同比例 Δx/Δy，像素上几乎纯水平
const WIDE_W = 320;
const WIDE_H = 120;

const wideLeft = ratioDeltaToPixel(-0.12, -0.12, WIDE_W, WIDE_H);
assert.ok(Math.abs(wideLeft.px) > Math.abs(wideLeft.py) * 3, 'wide stage: horizontal px dominates');
assert.strictEqual(
  walkClipForRatioDelta(-0.12, -0.12, WIDE_W, WIDE_H),
  'walk_left',
  'wide stage equal ratio deltas should pick horizontal walk, not diagonal'
);

assert.strictEqual(walkClipForPixelDelta(-40, -40), 'walk_left_up');
assert.strictEqual(walkClipForPixelDelta(-40, -5), 'walk_left');
assert.strictEqual(walkClipForPixelDelta(0, -30), 'walk_up');
assert.strictEqual(walkClipForPixelDelta(30, 30), 'walk_right_down');

// 近似正方形舞台：比例与像素方向一致
const SQ = 200;
assert.strictEqual(walkClipForRatioDelta(-0.1, -0.1, SQ, SQ), 'walk_left_up');
assert.strictEqual(walkClipForRatioDelta(0.1, 0.1, SQ, SQ), 'walk_right_down');
assert.strictEqual(walkClipForRatioDelta(0.15, 0, SQ, SQ), 'walk_right');
assert.strictEqual(walkClipForRatioDelta(0, 0.15, SQ, SQ), 'walk_down');

console.log('pet-walk.test.js: ok');
