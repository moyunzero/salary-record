/** 8 向 walk：角度与屏幕像素位移一致（y 向下为正） */

const SPRITE_PX = 72;

const WALK_8 = [
  { clip: 'walk_right', angle: 0 },
  { clip: 'walk_right_down', angle: Math.PI / 4 },
  { clip: 'walk_down', angle: Math.PI / 2 },
  { clip: 'walk_left_down', angle: (3 * Math.PI) / 4 },
  { clip: 'walk_left', angle: Math.PI },
  { clip: 'walk_left_up', angle: (-3 * Math.PI) / 4 },
  { clip: 'walk_up', angle: -Math.PI / 2 },
  { clip: 'walk_right_up', angle: -Math.PI / 4 },
];

function roamExtents(stageWidth, stageHeight, spritePx = SPRITE_PX) {
  return {
    maxX: Math.max(1, (stageWidth || 280) - spritePx),
    maxY: Math.max(1, (stageHeight || 100) - spritePx),
  };
}

function ratioDeltaToPixel(dx, dy, stageWidth, stageHeight, spritePx = SPRITE_PX) {
  const { maxX, maxY } = roamExtents(stageWidth, stageHeight, spritePx);
  return { px: dx * maxX, py: dy * maxY, maxX, maxY };
}

function walkClipForPixelDelta(px, py) {
  if (Math.abs(px) < 0.5 && Math.abs(py) < 0.5) return 'walk_down';
  const angle = Math.atan2(py, px);
  let best = WALK_8[0];
  let bestDiff = Infinity;
  for (let i = 0; i < WALK_8.length; i += 1) {
    let diff = Math.abs(angle - WALK_8[i].angle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = WALK_8[i];
    }
  }
  return best.clip;
}

/** 根据归一化坐标差 + 舞台尺寸，选择与像素移动方向一致的 walk clip */
function walkClipForRatioDelta(dx, dy, stageWidth, stageHeight, spritePx = SPRITE_PX) {
  const { px, py } = ratioDeltaToPixel(dx, dy, stageWidth, stageHeight, spritePx);
  return walkClipForPixelDelta(px, py);
}

/** walk 时长：按像素路程估算循环次数 */
function estimateWalkCycles(
  dx,
  dy,
  stageWidth,
  stageHeight,
  frameCount,
  cycleMs,
  renderPx = 64,
  spritePx = SPRITE_PX
) {
  const { maxX, maxY } = roamExtents(stageWidth, stageHeight, spritePx);
  const distPx = Math.hypot(dx * maxX, dy * maxY);
  const stepPx = renderPx * 1.15;
  const cycles = Math.max(1, Math.ceil(distPx / stepPx));
  return { cycles, cycleMs: cycles * cycleMs, distPx };
}

module.exports = {
  SPRITE_PX,
  WALK_8,
  roamExtents,
  ratioDeltaToPixel,
  walkClipForPixelDelta,
  walkClipForRatioDelta,
  estimateWalkCycles,
};
