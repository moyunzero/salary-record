const assert = require('assert');
const { createMicroSession, isWalkKind } = require('../../miniprogram/core/pet-micro');
const {
  SEGMENT,
  REST_MIN_MS,
  REST_MIN_MS_DEBUG,
  pickNextSegmentAction,
  onRhythmBlockComplete,
  enterSegment,
  canPickSleep,
  initRhythmOnSession,
  getRestMinMs,
  shouldPreserveRhythmOnSceneChange,
} = require('../../miniprogram/core/pet-rhythm');
const {
  buildSleepTapRecovery,
  buildAwakeTapRecovery,
  startRecoveryChain,
  advanceRecoveryChain,
} = require('../../miniprogram/core/pet-recovery');

const habit = { napCorner: 'center', dayMood: 'sleepy', affinity: 'high' };
const onShiftMorning = new Date('2026-06-23T10:00:00+08:00');
const onShiftAfternoon = new Date('2026-06-23T15:00:00+08:00');
const evening = new Date('2026-06-23T19:00:00+08:00');

function mulberry32(seed) {
  let s = seed >>> 0;
  return function rng() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

assert.strictEqual(getRestMinMs(false), REST_MIN_MS);
assert.strictEqual(getRestMinMs(true), REST_MIN_MS_DEBUG);

const calmRhythm = initRhythmOnSession(createMicroSession());
calmRhythm.arousal = 'calm';
assert.strictEqual(canPickSleep(calmRhythm, 'onShift'), true);
assert.strictEqual(canPickSleep(calmRhythm, 'done-active'), false);

const stressedRhythm = initRhythmOnSession(createMicroSession());
stressedRhythm.arousal = 'stressed';
assert.strictEqual(canPickSleep(stressedRhythm, 'onShift'), false);

let onShiftWalk = 0;
for (let i = 0; i < 200; i += 1) {
  const session = createMicroSession();
  const { block } = pickNextSegmentAction({
    scene: 'onShift',
    escalation: 0,
    habit,
    session,
    rng: mulberry32(100 + i),
    now: onShiftMorning,
    debug: true,
  });
  if (isWalkKind(block.kind)) onShiftWalk += 1;
}
assert.ok(onShiftWalk >= 100, `onShift rhythm walk ${onShiftWalk / 2}%`);

const restSession = createMicroSession();
const rhythm = initRhythmOnSession(restSession);
enterSegment(rhythm, SEGMENT.REST, onShiftMorning, habit, () => 0.5, 'onShift', true);
assert.strictEqual(rhythm.segment, SEGMENT.REST);
assert.ok(rhythm.segmentUntil - onShiftMorning.getTime() >= REST_MIN_MS_DEBUG - 50);

const loopResult = onRhythmBlockComplete(
  restSession,
  { kind: 'clip', clip: rhythm.restClip, rhythmLoop: true },
  onShiftMorning.getTime() + 2000,
  {
    scene: 'onShift',
    escalation: 0,
    habit,
    doneBand: 'onShift',
    debug: true,
    rng: () => 0.5,
  }
);
assert.strictEqual(loopResult.loopRest, true);

const hissSession = createMicroSession();
enterSegment(hissSession.rhythm, SEGMENT.STRESS_COOLDOWN, evening, habit, () => 0.5, 'overtime-L4', true);
const afterHiss = onRhythmBlockComplete(
  hissSession,
  { kind: 'clip', clip: 'hiss_l' },
  evening.getTime() + 1000,
  {
    scene: 'overtime',
    escalation: 4,
    habit,
    doneBand: 'overtime-L4',
    debug: true,
    rng: () => 0.5,
  }
);
assert.ok(afterHiss.continueSegment || afterHiss.loopRest);
assert.strictEqual(hissSession.rhythm.arousal, 'stressed');
const nextAfterHiss = pickNextSegmentAction({
  scene: 'overtime',
  escalation: 4,
  habit,
  session: hissSession,
  rng: () => 0.99,
  now: evening,
  doneBand: 'overtime-L4',
  debug: true,
});
if (nextAfterHiss.block.clip) {
  assert.ok(!nextAfterHiss.block.clip.startsWith('sleep'), 'stressed must not sleep');
}

const sleepRecovery = buildSleepTapRecovery('sleep1_l', habit, () => 0.9);
assert.ok(sleepRecovery.queue.length >= 2);
const chain = startRecoveryChain(sleepRecovery);
assert.strictEqual(chain.phase, 'recovery');
const adv = advanceRecoveryChain(chain);
assert.strictEqual(adv.done, false);

const awakeRecovery = buildAwakeTapRecovery({
  scene: 'onShift',
  escalation: 0,
  currentClip: 'idle_a',
  segment: SEGMENT.REST,
  zone: 'body',
});
assert.ok(awakeRecovery.queue.length >= 1);
assert.strictEqual(awakeRecovery.resumeSegment, SEGMENT.REST);

const restRhythm = initRhythmOnSession(createMicroSession());
enterSegment(restRhythm, SEGMENT.REST, onShiftAfternoon, habit, () => 0.5, 'onShift', true);
assert.strictEqual(
  shouldPreserveRhythmOnSceneChange('onShift', 'done', restRhythm),
  false,
  'clock-out must not preserve work-time REST'
);

const doneActiveSession = createMicroSession();
const { block: doneBlock } = pickNextSegmentAction({
  scene: 'done',
  escalation: 0,
  habit,
  session: doneActiveSession,
  rng: () => 0.5,
  now: evening,
  doneBand: 'done-active',
  debug: true,
});
assert.ok(
  !doneBlock.clip || !doneBlock.clip.startsWith('sleep'),
  'done-active must not start with sleep clip'
);

console.log('pet-rhythm tests passed');
