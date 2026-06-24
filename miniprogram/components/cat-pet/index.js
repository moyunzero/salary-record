const ATLAS = require('../../assets/cat-pet/cat1-atlas-data.js');
const { loadOrCreateProfile } = require('../../core/pet-habit');
const {
  HEAD_PAT_COOLDOWN_MS,
  COMBO_COOLDOWN_MS,
  COMBO_WINDOW_MS,
  COMBO_TAP_COUNT,
  hitZone,
  applyHabitToRotations,
  pickHeadPatReaction,
  comboClipForScene,
  roamTargetRatios,
  groomBeatDelayMs,
  evaluateCompanionNudge,
} = require('../../core/pet-companion');
const { playCompanionSfx } = require('../../services/companion-sfx');
const {
  pickArc,
  resolveArcStep,
  stepCycleMs,
  resolveDoneBand,
  shouldHoldAfterTerminal,
  ambientWalkKey,
  nextAmbientWalkDelay,
  sleepSide,
} = require('../../core/pet-arcs');
const {
  createMicroSession,
  recordTap,
  isExcitedPatrol,
  onBlockComplete,
  resolveWalkTarget,
} = require('../../core/pet-micro');
const {
  pickNextSegmentAction,
  onRhythmBlockComplete,
  shouldFlipRestClip,
  flipRestClip,
  pauseRhythmForRecovery,
  resumeRhythmAfterRecovery,
  onRhythmExcitedPatrolEnd,
  handleRhythmEscalationJump,
  shouldPreserveRhythmOnSceneChange,
  enterSegment,
  SEGMENT,
} = require('../../core/pet-rhythm');
const {
  buildSleepTapRecovery,
  buildAwakeTapRecovery,
  startRecoveryChain,
  advanceRecoveryChain,
  buildPostExcitedRecovery,
} = require('../../core/pet-recovery');
const {
  isSleepClip,
  sleepTier,
  pickSleepInterrupt,
  pickAwakeTap,
  postInterruptResume,
  POST_INTERRUPT_YAWN,
  canCompanionNudgeDuringArc,
  shouldPostInterruptYawn,
} = require('../../core/pet-interrupt');
const { walkClipForRatioDelta, estimateWalkCycles } = require('../../core/pet-walk');

const SPRITE_SCALE = ATLAS.meta.displayScale || 2;
const SPRITE_SIZE = ATLAS.meta.spriteSize || 32;
const SHEET_W = (ATLAS.meta.sheetWidth || 352) * SPRITE_SCALE;
const SHEET_H = (ATLAS.meta.sheetHeight || 1696) * SPRITE_SCALE;
const SPRITE_PX = 72;
const RENDER_PX = SPRITE_SIZE * SPRITE_SCALE;

const TAP_COOLDOWN_MS = 8000;
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_WASH_COOLDOWN_MS = 8000;
const OVERLAY_MIN_MS = 2000;
const OVERLAY_MAX_MS = 3000;
/** >1 = slower per-frame sprite advance (manifest fps unchanged) */
const PET_ANIM_FRAME_SCALE = 1.65;
const WALK_MIN_DIST = 0.06;
const ROAM_TX_MIN = 0;
const ROAM_TX_MAX = 1;
const ROAM_TY_MIN = 0;
const ROAM_TY_MAX = 1;
const FALLBACK_CLIP = 'idle_a';

function clipFrameMs(fps) {
  return (1000 / (fps || 5)) * PET_ANIM_FRAME_SCALE;
}

function clipCycleMs(frameCount, fps) {
  return (frameCount || 1) * clipFrameMs(fps);
}

function clampRoamRatio(tx, ty) {
  return {
    tx: Math.max(ROAM_TX_MIN, Math.min(ROAM_TX_MAX, tx)),
    ty: Math.max(ROAM_TY_MIN, Math.min(ROAM_TY_MAX, ty)),
  };
}

const IDLE_SCENES = ['beforeWork', 'onShift', 'nightShift'];

function idleClipForAlt(useAlt) {
  return useAlt ? 'idle_b' : 'idle_a';
}

const CONTEXT_CLIP_MAP = {
  beforeWork: {
    primary: 'idle_a',
    primaryCycleMs: 20000,
    rotations: [
      { clip: 'idle_b', cycleMs: 8000, weight: 0.5 },
      { clip: 'eat_down', cycleMs: 8000, weight: 0.5 },
    ],
    rotationChance: 0.1,
  },
  onShift: {
    primary: 'idle_a',
    primaryCycleMs: 25000,
    rotations: [
      { clip: 'wash_sit', cycleMs: 8000, weight: 0.85 },
      { clip: 'scratch_l', cycleMs: 8000, weight: 0.075 },
      { clip: 'scratch_r', cycleMs: 8000, weight: 0.075 },
    ],
    rotationChance: 0.15,
  },
  lunch: {
    primary: 'eat_down',
    primaryCycleMs: 15000,
    rotations: [
      { clip: 'sleep2_l', cycleMs: 20000, weight: 0.5 },
      { clip: 'sleep2_r', cycleMs: 20000, weight: 0.5 },
    ],
    rotationChance: 1,
  },
  dinner: {
    primary: 'eat_down',
    primaryCycleMs: 15000,
    rotations: [
      { clip: 'idle_b', cycleMs: 12000, weight: 0.5 },
      { clip: 'wash_sit', cycleMs: 12000, weight: 0.5 },
    ],
    rotationChance: 1,
  },
  nightShift: {
    primary: 'idle_a',
    primaryCycleMs: 30000,
    rotations: [{ clip: 'wash_sit', cycleMs: 8000, weight: 1 }],
    rotationChance: 1,
    yawnIntervalMs: 45000,
    yawnClip: 'yawn_sit',
  },
  done: {
    primary: 'idle_a',
    primaryCycleMs: 22000,
    rotations: [
      { clip: 'wash_sit', cycleMs: 8000, weight: 0.5 },
      { clip: 'yawn_sit', cycleMs: 6000, weight: 0.5 },
    ],
    rotationChance: 0.85,
  },
};

const OVERTIME_MAP = {
  1: {
    primary: 'yawn_sit',
    alternate: 'yawn_stand',
    alternateEveryMs: 8000,
  },
  2: {
    primary: 'meow_stand',
    primaryCycleMs: 12000,
    rotations: [{ clip: 'yawn_sit', cycleMs: 12000, weight: 1 }],
    rotationChance: 1,
  },
  3: {
    clips: ['hiss_l', 'paw_attack_down'],
    alternateMs: 3000,
  },
  4: {
    primary: 'sad_sit_down',
    occasionalClip: 'paw_attack_down',
    occasionalChance: 0.15,
    occasionalMs: 10000,
  },
};

const TAP_POOLS = {
  beforeWork: [
    { clip: 'meow_stand', weight: 0.7 },
    { clip: 'paw_attack_down', weight: 0.2 },
    { clip: 'scratch_l', weight: 0.05 },
    { clip: 'scratch_r', weight: 0.05 },
  ],
  onShift: [
    { clip: 'meow_stand', weight: 0.7 },
    { clip: 'paw_attack_down', weight: 0.2 },
    { clip: 'scratch_l', weight: 0.05 },
    { clip: 'scratch_r', weight: 0.05 },
  ],
  nightShift: [
    { clip: 'meow_stand', weight: 0.7 },
    { clip: 'paw_attack_down', weight: 0.2 },
    { clip: 'scratch_l', weight: 0.05 },
    { clip: 'scratch_r', weight: 0.05 },
  ],
  lunch: [
    { clip: 'meow_sit', weight: 0.5 },
    { clip: 'eat_down', weight: 0.5, singleCycle: true },
  ],
  dinner: [
    { clip: 'meow_sit', weight: 0.5 },
    { clip: 'eat_down', weight: 0.5, singleCycle: true },
  ],
  overtimeLow: [
    { clip: 'meow_stand', weight: 0.5 },
    { clip: 'yawn_sit', weight: 0.5 },
  ],
  overtimeHigh: [
    { clip: 'paw_attack_down', weight: 0.7 },
    { clip: 'hiss_l', weight: 0.3, singleFrame: true },
  ],
  done: [
    { clip: 'meow_stand', weight: 0.55 },
    { clip: 'paw_attack_down', weight: 0.25, singleCycle: true },
    { clip: 'scratch_l', weight: 0.1, singleCycle: true },
    { clip: 'scratch_r', weight: 0.1, singleCycle: true },
  ],
  offDuty: [
    { clip: 'meow_stand', weight: 0.6 },
    { clip: 'paw_attack_down', weight: 0.2, singleCycle: true },
    { clip: 'scratch_l', weight: 0.1, singleCycle: true },
    { clip: 'scratch_r', weight: 0.1, singleCycle: true },
  ],
};

const ROAM_SCENES = {
  beforeWork: { interval: [5000, 12000], always: true },
  offDuty: { interval: [5000, 12000], always: true },
  done: { interval: [8000, 16000], always: true },
  lunch: { interval: [14000, 24000], chance: 0.45 },
  dinner: { interval: [14000, 24000], chance: 0.45 },
  onShift: { interval: [22000, 38000], chance: 0.3 },
  nightShift: { interval: [28000, 42000], chance: 0.2 },
};

function frameToOffset(frameKey) {
  const rect = ATLAS.frames[String(frameKey)];
  const padX = (SPRITE_PX - RENDER_PX) / 2;
  const padY = SPRITE_PX - RENDER_PX;
  if (!rect) return { x: padX, y: padY };
  return {
    x: padX - rect.x * SPRITE_SCALE,
    y: padY - rect.y * SPRITE_SCALE,
  };
}

function pickWeighted(pool) {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    r -= pool[i].weight;
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

Component({
  properties: {
    scene: { type: String, value: 'beforeWork' },
    escalation: { type: Number, value: 0 },
    appState: { type: String, value: 'idle' },
    morningStart: { type: String, value: '09:00' },
    lunchStart: { type: String, value: '12:00' },
    forceClip: { type: String, value: '' },
    debug: { type: Boolean, value: false },
    useMicroFsm: { type: Boolean, value: true },
    useArcFsm: { type: Boolean, value: false },
    debugDoneBand: { type: String, value: '' },
    dockHeight: { type: Number, value: 0 },
  },

  data: {
    spriteX: 0,
    spriteY: 0,
    posX: 0,
    posY: 0,
    sheetW: SHEET_W,
    sheetH: SHEET_H,
    debugStageW: 0,
    debugStageH: 0,
    debugMaxX: 0,
    debugMaxY: 0,
    debugCanRoam: false,
  },

  observers: {
    'scene, escalation': function (scene, escalation) {
      if (!this._alive || this.properties.forceClip) return;
      const prevScene = this._lastObsScene;
      const prevEsc = this._lastObsEscalation;
      const sceneChanged = prevScene !== undefined && prevScene !== scene;
      const escChanged = prevScene !== undefined && prevEsc !== escalation;
      this._lastObsScene = scene;
      this._lastObsEscalation = escalation;

      if (this.isMicroActive()) {
        if (prevScene !== undefined && this._microSession) {
          this._handleMicroContextChange(prevScene, prevEsc, scene, escalation);
        } else {
          this.resetMicroState(true);
        }
      } else {
        this.resetArcState();
      }
      if (sceneChanged || escChanged) {
      this.resetClipState();
        this.resetRoamPlan();
      }
      this.onCompanionSceneChange();
      this.emitDebugInfo();
      wx.nextTick(() => this.measureStage());
    },
    appState: function () {
      /* appState does not fork companion C layer */
    },
    forceClip: function (clip) {
      if (!this._alive) return;
      if (clip) {
        this._overlayClip = null;
        this._inRotation = false;
        this._activeClipName = clip;
        this._frameIdx = 0;
        this._cycleStartAt = Date.now();
        this.updateSpriteStyle();
      } else {
        this.resetClipState();
      }
      this.emitDebugInfo();
    },
    debug: function (enabled) {
      if (enabled) {
        this.measureStage();
        this.emitDebugInfo();
      }
    },
    dockHeight: function (h) {
      if (!this._alive || !h) return;
      if (this._stageWidth > SPRITE_PX + 8) {
        this.setStageSize(this._stageWidth, h);
      } else {
        this._applyDockFallbackSize();
        this.measureStage();
      }
      if (this._isWalking || this._arcWalkActive) {
        this.updatePositionDisplay(true);
        this._reconcileMicroWalk();
      }
    },
  },

  lifetimes: {
    attached() {
      this.init();
    },
    detached() {
      this.teardown();
    },
  },

  pageLifetimes: {
    show() {
      if (this._alive) {
        this.startLoop();
        this.resetCompanionSession();
        wx.nextTick(() => this.measureStage());
      }
    },
  },

  methods: {
    init() {
      this._alive = true;
      this._frameIdx = 0;
      this._lastTick = 0;
      this._cycleStartAt = Date.now();
      this._activeClipName = FALLBACK_CLIP;
      this._inRotation = false;
      this._l3Phase = 0;
      this._l3LastSwitch = Date.now();
      this._l4LastOccasional = Date.now();
      this._doneUseAlt = false;
      this._idleAlt = false;
      this._otL1UseAlt = false;
      this._otL1LastSwitch = Date.now();
      this._nightLastYawn = 0;
      this._tapCooldownUntil = 0;
      this._overlayUntil = 0;
      this._overlayClip = null;
      this._overlaySingleFrame = false;
      this._overlaySingleCycle = false;
      this._lastSpriteX = null;
      this._lastSpriteY = null;
      this._posRatioX = 0.5;
      this._posRatioY = 0.82;
      this._moveTarget = null;
      this._isWalking = false;
      this._stageWidth = 0;
      this._stageHeight = 0;
      this._lastPosPx = -1;
      this._lastPosPy = -1;
      this._lastLoopAt = 0;
      this._headPatCooldownUntil = 0;
      this._comboCooldownUntil = 0;
      this._comboTimes = [];
      this._arcLastTapAt = 0;
      this._doubleTapCooldownUntil = 0;
      this._nextAmbientWalkAt = 0;
      this._ambientWalkOnly = false;
      this._arcId = '';
      this._arcStepIdx = 0;
      this._arcStepCycle = 0;
      this._arcStepStartedAt = 0;
      this._arcWalkActive = false;
      this._arcWalkRemaining = 0;
      this._walkingFromArc = false;
      this._stressPhase = 0;
      this._scratchPhase = 0;
      this._interruptChain = null;
      this._arcResumeClip = null;
      this._arcHeld = false;
      this._arcStepTerminal = false;
      this._microSession = null;
      this._microBlock = null;
      this._microHold = false;
      this._inSleep4Hold = false;
      this._microBlockStartedAt = 0;
      this._microBlockDurationMs = 0;
      this._microWalkFromMicro = false;
      this._doneNightEntryDone = false;
      this._doneNightEntryQueue = null;
      this._wasExcitedPatrol = false;

      this.resetCompanionSession();
      if (this.isMicroActive()) {
        this.resetMicroState(false);
      } else {
            this.resetClipState();
      }
      this.resetRoamPlan();
      this.updateSpriteStyle();
            this.startLoop();
      wx.nextTick(() => this.measureStage());
    },

    teardown() {
      this._alive = false;
      if (this._loopTimer) {
        clearTimeout(this._loopTimer);
        this._loopTimer = null;
      }
    },

    zoneFromEvent(e) {
      const d = (e && e.detail) || {};
      const x = typeof d.x === 'number' ? d.x : SPRITE_PX / 2;
      const y = typeof d.y === 'number' ? d.y : SPRITE_PX / 2;
      return hitZone(x, y, SPRITE_PX, SPRITE_PX);
    },

    resetCompanionSession() {
      this._companionNudged = {};
      this._prevEscalation = this.properties.escalation || 0;
      this._sceneEnteredAt = Date.now();
      this._groomBeatDone = false;
      this._habit = loadOrCreateProfile();
      this.scheduleGroomBeat();
    },

    onCompanionSceneChange() {
      this._sceneEnteredAt = Date.now();
      this._groomBeatDone = false;
      this._nightLastYawn = Date.now();
      const band = this.resolveDoneBandForPet(Date.now());
      if ((this.properties.scene || '') !== 'done' || band !== 'done-night') {
        this._doneNightEntryDone = false;
      }
      if ((this.properties.scene || '') === 'done' && band === 'done-active') {
        this._wakeForDoneActive();
      }
      if (!this.isMicroActive()) {
        this.resetArcState();
      }
      this.scheduleGroomBeat();
    },

    _wakeForDoneActive() {
      this._inSleep4Hold = false;
      this._microHold = false;
      this._doneNightEntryQueue = null;
      const clip = this._activeClipName || '';
      if (clip.startsWith('sleep')) {
        this._activeClipName = 'idle_a';
        this._frameIdx = 0;
        this._cycleStartAt = Date.now();
        this.updateSpriteStyle();
      }
    },

    _rhythmCtx(now) {
      return {
        scene: this.properties.scene || '',
        escalation: this.properties.escalation || 0,
        habit: this._habit,
        doneBand: this.resolveDoneBandForPet(now),
        debug: !!this.properties.debug,
        rng: Math.random,
      };
    },

    _enterExcitedRoam(now) {
      if (!this._microSession) return;
      const { sceneMicroKey } = require('../../core/pet-micro');
      const sceneKey =
        this.resolveDoneBandForPet(now) ||
        sceneMicroKey(
          this.properties.scene || '',
          this.properties.escalation || 0,
          now
        );
      enterSegment(
        this._microSession.rhythm,
        SEGMENT.ROAM,
        now,
        this._habit,
        Math.random,
        sceneKey,
        !!this.properties.debug
      );
      this._microSession.rhythm.roamWalkSteps = 3;
    },

    _handleMicroContextChange(prevScene, prevEsc, scene, escalation) {
      const now = Date.now();
      const ctx = this._rhythmCtx(now);
      if (
        handleRhythmEscalationJump(
          this._microSession,
          prevEsc || 0,
          escalation || 0,
          now,
          ctx
        )
      ) {
        this._microHold = false;
        this._scheduleNextMicro(false);
          return;
        }
      const rhythm = this._microSession && this._microSession.rhythm;
      if (
        prevScene !== scene &&
        shouldPreserveRhythmOnSceneChange(prevScene, scene, rhythm)
      ) {
              return;
            }
      if (prevScene !== scene || prevEsc !== escalation) {
        this.resetMicroState(true);
      }
    },

    isMicroActive() {
      return !!this.properties.useMicroFsm && !this.properties.forceClip;
    },

    isArcActive() {
      return !!this.properties.useArcFsm && !this.properties.useMicroFsm && !this.properties.forceClip;
    },

    resolveDoneBandForPet(now) {
      if (this.properties.debugDoneBand) return this.properties.debugDoneBand;
      if ((this.properties.scene || '') === 'done') return resolveDoneBand(now);
      return '';
    },

    resetMicroState(preserveExcited) {
      if (!this.isMicroActive()) return;

      const prevExcited =
        preserveExcited && this._microSession
          ? {
              excitedPatrolUntil: this._microSession.excitedPatrolUntil,
              excitedCooldownUntil: this._microSession.excitedCooldownUntil,
            }
          : null;

      this._microSession = createMicroSession();
      if (prevExcited) {
        this._microSession.excitedPatrolUntil = prevExcited.excitedPatrolUntil;
        this._microSession.excitedCooldownUntil = prevExcited.excitedCooldownUntil;
      }

      this._microBlock = null;
      this._microHold = false;
      this._inSleep4Hold = false;
      this._microBlockStartedAt = 0;
      this._microBlockDurationMs = 0;
      this._microWalkFromMicro = false;
      this._interruptChain = null;
      this._arcWalkActive = false;
      this._arcWalkRemaining = 0;
      this._walkingFromArc = false;
      this._ambientWalkOnly = false;
      this._nextAmbientWalkAt = 0;
      this._arcId = '';
      this._arcStepIdx = 0;
      this._arcHeld = false;

      const band = this.resolveDoneBandForPet(Date.now());
      if ((this.properties.scene || '') === 'done' && band === 'done-night' && !this._doneNightEntryDone) {
        this._runDoneNightEntry();
        return;
      }

      if ((this.properties.scene || '') === 'done' && band === 'done-active') {
        this._wakeForDoneActive();
        this._activeClipName = 'idle_a';
        this._frameIdx = 0;
        this._cycleStartAt = Date.now();
        this.updateSpriteStyle();
        this._enterExcitedRoam(Date.now());
      }

      this._scheduleNextMicro(true);
    },

    _runDoneNightEntry() {
      const side = sleepSide(this._habit, Math.random);
      this._doneNightEntryQueue = [
        { kind: 'clip', clip: 'yawn_sit', singleCycle: true },
        { kind: 'clip', clip: `sleep3_${side}`, singleCycle: true },
        { kind: 'hold', clip: `sleep4_${side}` },
      ];
      this._runNextDoneNightEntryStep();
    },

    _runNextDoneNightEntryStep() {
      if (!this._doneNightEntryQueue || !this._doneNightEntryQueue.length) {
        this._doneNightEntryQueue = null;
        return;
      }
      const block = this._doneNightEntryQueue.shift();
      this._runMicroBlock(block);
      if (block.kind === 'hold') {
        this._doneNightEntryDone = true;
        this._doneNightEntryQueue = null;
      }
    },

    _microBlockDuration(block) {
      if (!block || block.kind === 'hold' || block.kind === 'walk' || block.kind === 'microWalk') {
        return 0;
      }
      const clipName = block.clip || FALLBACK_CLIP;
      const clipDef = this.getClipDef(clipName);
      const frameCount = (clipDef && clipDef.frames && clipDef.frames.length) || 8;
      const fps = (clipDef && clipDef.fps) || 5;
      const msPerFrame = clipFrameMs(fps);
      let frames = frameCount;
      if (block.singleCycle || (clipDef && clipDef.loop === false)) {
        frames = frameCount;
      }
      if (block.kind === 'clipHalf' || this._shouldStressClipHalf(clipName)) {
        frames = Math.max(1, Math.ceil(frameCount / 2));
      }
      return frames * msPerFrame;
    },

    _shouldStressClipHalf(clip) {
      const scene = this.properties.scene || '';
      const esc = this.properties.escalation || 0;
      if (scene !== 'overtime' || esc < 3) return false;
      return !!(clip && (clip.startsWith('hiss_') || clip.startsWith('paw_attack')));
    },

    _runMicroBlock(block) {
      if (!block) return;

      this._microBlock = block;
      this._microHold = false;
      this._microBlockStartedAt = Date.now();
      this._microBlockDurationMs = this._microBlockDuration(block);

      if (block.kind === 'hold') {
        this._activeClipName = block.clip || FALLBACK_CLIP;
        this._microHold = true;
        this._frameIdx = 0;
        this._cycleStartAt = Date.now();
        if (
          block.clip &&
          block.clip.startsWith('sleep4') &&
          this.resolveDoneBandForPet(Date.now()) === 'done-night'
        ) {
          this._inSleep4Hold = true;
          this._doneNightEntryDone = true;
        }
        this.updateSpriteStyle();
        return;
      }

      if (block.kind === 'walk' || block.kind === 'microWalk') {
        this._microWalkFromMicro = true;
        this._walkingFromArc = true;
        this._arcWalkActive = true;
        this._arcWalkRemaining = block.walkSteps || 1;
        this._arcStepStartedAt = Date.now();
        wx.nextTick(() => this.triggerMicroWalk(block));
        return;
      }

      this._activeClipName = block.clip || FALLBACK_CLIP;
      this._frameIdx = 0;
      this._cycleStartAt = Date.now();
      this._inRotation = false;
      this._playMeowClipSfx(this._activeClipName);
      this.updateSpriteStyle();
    },

    triggerMicroWalk(block) {
      if (
        !this._stageWidth ||
        !this._stageHeight ||
        this._stageHeight <= SPRITE_PX + 8
      ) {
        if (!this._applyDockFallbackSize()) {
          this.measureStage();
          setTimeout(() => {
            if (this._alive && this._arcWalkActive) this.triggerMicroWalk(block || this._microBlock);
          }, 120);
          return;
        }
      }

      let tx;
      let ty;
      if (this.isMicroActive() && this._microSession) {
        const resolved = resolveWalkTarget({
          scene: this.properties.scene || '',
          habit: this._habit,
          session: this._microSession,
          excited: isExcitedPatrol(this._microSession, Date.now()),
          rng: Math.random,
          now: Date.now(),
        });
        if (block) block.target = resolved;
        tx = resolved.tx;
        ty = resolved.ty;
      } else {
        const target = (block && block.target) || {};
        tx = typeof target.tx === 'number' ? target.tx : 0.5;
        ty = typeof target.ty === 'number' ? target.ty : 0.55;
      }

      const clamped = clampRoamRatio(tx, ty);
      tx = clamped.tx;
      ty = clamped.ty;

      const dx = tx - this._posRatioX;
      const dy = ty - this._posRatioY;
      if (Math.hypot(dx, dy) < WALK_MIN_DIST) {
        this._skipMicroWalkStep();
        return;
      }

      this._nextWanderAt = Infinity;
      this._moveTarget = { x: tx, y: ty };
      this._walkStart = { x: this._posRatioX, y: this._posRatioY };
      this._isWalking = true;
      this._activeClipName = walkClipForRatioDelta(
        dx,
        dy,
        this._stageWidth,
        this._stageHeight,
        SPRITE_PX
      );
      this._frameIdx = 0;
      this._walkDurationMs = this.estimateWalkDuration2D();
      this._walkStartedAt = Date.now();
      this.updatePositionDisplay(true);
      this.updateSpriteStyle();
    },

    _skipMicroWalkStep() {
      this._isWalking = false;
      this._moveTarget = null;
      if (this._arcWalkActive && this._arcWalkRemaining > 1) {
        this._arcWalkRemaining -= 1;
        wx.nextTick(() => this.triggerMicroWalk(this._microBlock));
        return;
      }
      this._arcWalkActive = false;
      this._arcWalkRemaining = 0;
      this._walkingFromArc = false;
      this._microWalkFromMicro = false;
      if (this.isMicroActive()) {
        this._onMicroClipCycleComplete(Date.now());
      }
    },

    _scheduleNextMicro(initial) {
      if (!this.isMicroActive()) return;
      if (this._microHold || this._interruptChain) return;
      if (this._isWalking || this._arcWalkActive) return;

      const now = Date.now();
      const { block } = pickNextSegmentAction({
        scene: this.properties.scene || '',
        escalation: this.properties.escalation || 0,
        now,
        habit: this._habit,
        session: this._microSession,
        rng: Math.random,
        doneBand: this.resolveDoneBandForPet(now),
        inSleep4Hold: this._inSleep4Hold,
        debug: !!this.properties.debug,
      });

      if (block.kind === 'hold' && this._inSleep4Hold) {
        this._microHold = true;
      }

      this._runMicroBlock(block);
      if (!initial) this.emitDebugInfo();
    },

    _applyRhythmAfterBlock(now) {
      if (!this._microSession) return false;
      const result = onRhythmBlockComplete(
        this._microSession,
        this._microBlock,
        now,
        this._rhythmCtx(now)
      );

      if (result.loopRest) {
        this._microBlockStartedAt = now;
        this._frameIdx = 0;
        this._cycleStartAt = now;
        const rhythm = this._microSession.rhythm;
        if (rhythm && shouldFlipRestClip(rhythm, now)) {
          const nextClip = flipRestClip(rhythm);
          this._activeClipName = nextClip;
          if (this._microBlock) this._microBlock.clip = nextClip;
        }
        this.updateSpriteStyle();
        return true;
      }

      if (result.continueSegment && result.block) {
        this._runMicroBlock(result.block);
        return true;
      }

      return false;
    },

    _onMicroClipCycleComplete(now) {
      const block = this._microBlock;
      onBlockComplete(this._microSession, block, {
        tx: this._posRatioX,
        ty: this._posRatioY,
      });
      this._microBlock = null;
      this._microBlockStartedAt = 0;
      this._microBlockDurationMs = 0;

      if (block && block.kind === 'hold') return;

      if (this._doneNightEntryQueue && this._doneNightEntryQueue.length) {
        this._runNextDoneNightEntryStep();
          return;
        }

      if (this._applyRhythmAfterBlock(now)) return;

      this._onMicroBlockComplete();
    },

    _onMicroBlockComplete() {
      if (this._microHold || this._interruptChain) return;
      this._scheduleNextMicro(false);
    },

    updateMicroFsm(now) {
      if (!this.isMicroActive()) return;

      if (!this._microSession) {
        this.resetMicroState(false);
        return;
      }

      const band = this.resolveDoneBandForPet(now);
      if (
        (this.properties.scene || '') === 'done' &&
        band === 'done-active' &&
        (this._inSleep4Hold || (this._activeClipName || '').startsWith('sleep'))
      ) {
        this._wakeForDoneActive();
        if (!this._isWalking && !this._arcWalkActive && !this._interruptChain) {
          this._enterExcitedRoam(now);
          this._scheduleNextMicro(false);
          return;
        }
      }

      if (this._interruptChain) {
        this.tickInterruptChain(now);
        return;
      }

      const session = this._microSession;
      if (session) {
        const excited = isExcitedPatrol(session, now);
        if (this._wasExcitedPatrol && !excited && !this._isWalking && !this._arcWalkActive) {
          const block = onRhythmExcitedPatrolEnd(session, now, this._rhythmCtx(now));
          if (block && !this._microBlock) {
            this._runMicroBlock(block);
            return;
          }
        }
        this._wasExcitedPatrol = excited;
      }

      if (this._microHold) return;
      if (this._isWalking || this._arcWalkActive) return;
      if (this._overlayClip && now < this._overlayUntil) return;

      if (!this._microBlock || !this._microBlockStartedAt) return;
      const clipName = this._activeClipName;
      if (!clipName || clipName.startsWith('walk_')) return;

      const elapsed = now - this._microBlockStartedAt;
      const ms =
        this._microBlockDurationMs ||
        stepCycleMs(clipName, 1, ATLAS.clips) ||
        2000;
      if (elapsed >= ms) {
        this._onMicroClipCycleComplete(now);
      }
    },

    debugInjectExcitedPatrol() {
      if (!this.properties.debug || !this.isMicroActive()) return;
      if (!this._microSession) this._microSession = createMicroSession();
      const now = Date.now();
      this._microSession.tapTimes = [now - 2000, now - 1000, now];
      const result = recordTap(this._microSession, now);
      if (result.triggeredPatrol) {
        playCompanionSfx('meow_mid', 1);
        this._microHold = false;
        this._inSleep4Hold = false;
        this._enterExcitedRoam(now);
        this._scheduleNextMicro(false);
      }
      this.emitDebugInfo();
    },

    scheduleGroomBeat() {
      const scene = this.properties.scene || '';
      if (scene !== 'beforeWork' || !this._habit) {
        this._groomBeatAt = 0;
        return;
      }
      if (this._habit.groomer === 'low') {
        this._groomBeatAt = 0;
        return;
      }
      this._groomBeatAt = Date.now() + groomBeatDelayMs(this._habit.seed);
    },

    isInteractionBusy() {
      return (
        this._isWalking ||
        !!(this._overlayClip && Date.now() < this._overlayUntil)
      );
    },

    _isOverlayActive(now = Date.now()) {
      return !!(this._overlayClip && now < this._overlayUntil);
    },

    _haltWalkForTap() {
      if (!this._isWalking) return;
      this._isWalking = false;
      this._moveTarget = null;
      this._walkStartedAt = 0;
      this.updatePositionDisplay(true);
    },

    _playMeowClipSfx(clipName) {
      if (!clipName || !clipName.startsWith('meow_')) return;
      const excited =
        this._microSession &&
        isExcitedPatrol(this._microSession, Date.now());
      const id =
        excited && clipName === 'meow_stand' ? 'meow_mid' : 'meow_soft';
      playCompanionSfx(id, 0.7);
    },

    playCompanionOverlay(reaction) {
      if (!reaction || !reaction.clip || this._isOverlayActive()) return false;
      this._overlayClip = reaction.clip;
      this._overlaySingleFrame = !!reaction.singleFrame;
      this._overlaySingleCycle = !!reaction.singleCycle;
      this._overlayUntil = Date.now() + (reaction.durationMs || 2500);
      this._frameIdx = 0;
      if (reaction.clip.startsWith('meow_')) {
        this._playMeowClipSfx(reaction.clip);
      } else if (reaction.sfx) {
        playCompanionSfx(reaction.sfx, reaction.sfxProb == null ? 1 : reaction.sfxProb);
      }
      this.updateSpriteStyle();
      this.emitDebugInfo();
      return true;
    },

    updateCompanionLayer(now) {
      if (this.properties.forceClip) return;

      if (
        !this._groomBeatDone &&
        this._groomBeatAt &&
        now >= this._groomBeatAt &&
        (this.properties.scene || '') === 'beforeWork'
      ) {
        this._groomBeatDone = true;
        this.playCompanionOverlay({
          clip: 'wash_sit',
          durationMs: 2800,
          sfx: 'wash',
          sfxProb: 1,
        });
        return;
      }

      if (this.isInteractionBusy()) return;

      const clipName = this.getCurrentClipName();
      const fsmActive = this.isArcActive() || this.isMicroActive();
      if (
        fsmActive &&
        !canCompanionNudgeDuringArc(clipName, !!this._interruptChain)
      ) {
        this._prevEscalation = this.properties.escalation || 0;
        return;
      }

      const nudge = evaluateCompanionNudge({
        scene: this.properties.scene || '',
        escalation: this.properties.escalation || 0,
        prevEscalation: this._prevEscalation,
        morningStart: this.properties.morningStart,
        lunchStart: this.properties.lunchStart,
        now: new Date(now),
        nudged: this._companionNudged,
        habit: this._habit,
        useArcFsm: this.isArcActive() || this.isMicroActive(),
      });

      if (nudge) {
        this._companionNudged[nudge.key] = true;
        this.playCompanionOverlay(nudge);
        this._prevEscalation = this.properties.escalation || 0;
        return;
      }

      if (
        fsmActive &&
        (this.properties.scene || '') === 'nightShift' &&
        !this._interruptChain &&
        canCompanionNudgeDuringArc(this.getCurrentClipName(), false)
      ) {
        if (now - (this._nightLastYawn || now) >= 45000) {
          this._nightLastYawn = now;
          this.playCompanionOverlay({
            clip: 'yawn_sit',
            singleCycle: true,
            durationMs: 3200,
            sfx: 'nudge.yawn',
            sfxProb: 1,
          });
        }
      }

      this._prevEscalation = this.properties.escalation || 0;
    },

    pickRotationPool(scene, rotations) {
      return applyHabitToRotations(scene, rotations, this._habit);
    },

    pickRotationPool(scene, rotations) {
      return applyHabitToRotations(scene, rotations, this._habit);
    },

    resetArcState() {
      if (!this.isArcActive()) return;
      const now = Date.now();
      const picked = pickArc(
        this.properties.scene || '',
        this._habit,
        this.properties.escalation || 0,
        Math.random,
        now
      );
      this._arcId = picked.arcId;
      this._arcStepIdx = picked.stepIdx;
      this._arcStepCycle = 0;
      this._arcWalkActive = false;
      this._arcWalkRemaining = 0;
      this._walkingFromArc = false;
      this._interruptChain = null;
      this._arcResumeClip = null;
      this._arcHeld = false;
      this._arcStepTerminal = false;
      this._stressPhase = 0;
      this._scratchPhase = 0;
      this._ambientWalkOnly = false;
      this.scheduleAmbientWalk(Date.now());
      this.applyArcStep(true);
    },

    scheduleAmbientWalk(now) {
      const scene = this.properties.scene || '';
      const key = ambientWalkKey(scene, now);
      if (!key) {
        this._nextAmbientWalkAt = 0;
        return;
      }
      this._nextAmbientWalkAt = now + nextAmbientWalkDelay(key);
    },

    maybeAmbientWalk(now) {
      if (!this._nextAmbientWalkAt || now < this._nextAmbientWalkAt) return;
      const scene = this.properties.scene || '';
      const key = ambientWalkKey(scene, now);
      if (!key || isSleepClip(this._activeClipName)) {
        this.scheduleAmbientWalk(now);
        return;
      }
      if (!this._stageWidth || !this._stageHeight) {
        this.scheduleAmbientWalk(now + 500);
        return;
      }
      this._ambientWalkOnly = true;
      this._walkingFromArc = true;
      this._arcWalkActive = true;
      this._arcWalkRemaining = 1;
      this._nextWanderAt = Infinity;
      this.pickWanderTarget(now, true);
      this.scheduleAmbientWalk(now);
    },

    arcStepContext() {
      return {
        habit: this._habit,
        rng: Math.random,
        walkRemaining: this._arcWalkRemaining || undefined,
        idleAlt: this._idleAlt,
        stressPhase: this._stressPhase,
        scratchPhase: this._scratchPhase,
      };
    },

    pickNextArc() {
      return pickArc(
        this.properties.scene || '',
        this._habit,
        this.properties.escalation || 0,
        Math.random,
        Date.now()
      );
    },

    applyArcStep(initial) {
      if (!this.isArcActive() || !this._arcId) return;

      const step = resolveArcStep(this._arcId, this._arcStepIdx, this.arcStepContext());
      if (step.arcComplete) {
        const picked = this.pickNextArc();
        this._arcId = picked.arcId;
        this._arcStepIdx = 0;
        this._arcStepCycle = 0;
        this._arcHeld = false;
        this.applyArcStep(false);
        return;
      }

      if (step.kind === 'walk') {
        this._arcWalkActive = true;
        this._arcWalkRemaining = step.walkRemaining;
        this._walkingFromArc = true;
        this._arcStepStartedAt = Date.now();
        wx.nextTick(() => this.triggerArcWalk());
        return;
      }

      this._activeClipName = this._arcResumeClip || step.clip;
      this._arcResumeClip = null;
      this._frameIdx = 0;
      this._cycleStartAt = Date.now();
      this._arcStepStartedAt = Date.now();
      this._inRotation = false;
      this._arcStepCycles = step.cycles || 1;
      this._arcStepTerminal = !!step.terminal;
      this._arcStepMs = step.stepMs || 0;
      this.updateSpriteStyle();
    },

    triggerArcWalk() {
      if (!this._stageWidth || !this._stageHeight) {
        setTimeout(() => {
          if (this._alive && this._arcWalkActive) this.triggerArcWalk();
        }, 120);
        return;
      }
      this._nextWanderAt = Infinity;
      this.pickWanderTarget(Date.now(), true);
    },

    advanceArcStep() {
      if (
        this._arcId === 'accompany' ||
        this._arcId === 'drowse' ||
        this._arcId === 'explore' ||
        this._arcId === 'homeLife'
      ) {
        this._idleAlt = !this._idleAlt;
      }
      if (this._arcId === 'stress') {
        this._stressPhase += 1;
      }
      if (this._arcId === 'homeLife') {
        this._scratchPhase += 1;
      }

      this._arcStepIdx += 1;
      this._arcStepCycle = 0;
      this.applyArcStep(false);
    },

    onArcStepCycleComplete(now) {
      if (this._arcHeld) return;

      const cycles = this._arcStepCycles || 1;
      if (this._arcStepCycle + 1 < cycles) {
        this._arcStepCycle += 1;
        this._arcStepStartedAt = now;
        this._frameIdx = 0;
        this._cycleStartAt = now;
        return;
      }
      if (this._arcStepTerminal) {
        const scene = this.properties.scene || '';
        if (shouldHoldAfterTerminal(scene, this._arcId, now)) {
          this._arcHeld = true;
        } else {
          const picked = this.pickNextArc();
          this._arcId = picked.arcId;
          this._arcStepIdx = 0;
          this._arcStepCycle = 0;
          this.applyArcStep(false);
        }
        return;
      }
      this.advanceArcStep();
    },

    updateArcFsm(now) {
      if (!this.isArcActive() || this.properties.forceClip) return;
      const scene = this.properties.scene || '';
      const escalation = this.properties.escalation || 0;

      if (!this._arcId) {
        this.resetArcState();
        return;
      }

      if (this._interruptChain) {
        this.tickInterruptChain(now);
        return;
      }

      if (
        this._arcHeld &&
        this._arcId === 'meltdown' &&
        scene === 'overtime' &&
        escalation >= 4 &&
        !(this._overlayClip && now < this._overlayUntil)
      ) {
        if (!this._l4LastOccasional) this._l4LastOccasional = now;
        if (now - this._l4LastOccasional >= 10000) {
          this._l4LastOccasional = now;
          if (Math.random() < 0.15) {
            this.playCompanionOverlay({
              clip: 'paw_attack_down',
              singleCycle: true,
              durationMs: 2200,
              sfx: 'paw',
              sfxProb: 0.3,
            });
          }
        }
      }

      if (this._arcHeld) return;

      if (this._isWalking || this._arcWalkActive) return;
      if (this._overlayClip && now < this._overlayUntil) return;

      this.maybeAmbientWalk(now);
      if (this._isWalking || this._arcWalkActive) return;

      const clipName = this._activeClipName;
      const clipMeta = ATLAS.clips;
      const elapsed = now - (this._arcStepStartedAt || now);
      const ms = this._arcStepMs || stepCycleMs(clipName, 1, clipMeta);
      if (elapsed >= ms) {
        this.onArcStepCycleComplete(now);
      }
    },

    finishRecoveryChain(chain, now) {
      this._interruptChain = null;
      this._overlayClip = null;
      this._overlayUntil = 0;

      if (!this._microSession) {
        this._scheduleNextMicro(false);
        return;
      }

      const rhythm = this._microSession.rhythm;
      const ctx = this._rhythmCtx(now);
      const { sceneMicroKey } = require('../../core/pet-micro');
      const sceneKey =
        ctx.doneBand ||
        sceneMicroKey(ctx.scene, ctx.escalation, now);

      if (chain.setsArousal && rhythm) {
        rhythm.arousal = chain.setsArousal;
      }

      if (chain.postWalkSteps && rhythm) {
        enterSegment(
          rhythm,
          SEGMENT.STRESS_COOLDOWN,
          now,
          this._habit,
          Math.random,
          sceneKey,
          ctx.debug
        );
        rhythm.roamWalkSteps = chain.postWalkSteps;
        rhythm.stressWalkDone = false;
        this._microHold = false;
        this._runMicroBlock({
          kind: 'walk',
          walkSteps: chain.postWalkSteps,
          rhythmStress: true,
        });
        this.updateSpriteStyle();
        this.emitDebugInfo();
        return;
      }

      rhythm.recoverySegment = null;
      rhythm.recoveryRemainingMs = 0;

      const resumed = resumeRhythmAfterRecovery(this._microSession, now, ctx);
      this._microHold = false;
      this._inSleep4Hold = false;
      if (resumed && resumed.block) {
        this._runMicroBlock(resumed.block);
      } else if (chain.resumeSegment && rhythm) {
        enterSegment(
          rhythm,
          chain.resumeSegment,
          now,
          this._habit,
          Math.random,
          sceneKey,
          ctx.debug
        );
        if (chain.restShortMs) {
          rhythm.segmentUntil = now + chain.restShortMs;
        }
        this._scheduleNextMicro(false);
      } else {
        this._scheduleNextMicro(false);
      }
      this.updateSpriteStyle();
      this.emitDebugInfo();
    },

    finishInterruptResume(fromClip, now) {
      const scene = this.properties.scene || '';
      const resume = postInterruptResume({
        scene,
        fromClip,
        habit: this._habit,
        now,
      });
      this._interruptChain = null;

      if (this.isMicroActive()) {
        if (resume.resumeArc && resume.clip) {
          this._activeClipName = resume.clip;
          this._frameIdx = 0;
          this._cycleStartAt = now;
          if (
            scene === 'done' &&
            this.resolveDoneBandForPet(now) === 'done-night' &&
            resume.clip.startsWith('sleep4')
          ) {
            this._inSleep4Hold = true;
            this._microHold = true;
            this._doneNightEntryDone = true;
            this._microBlock = { kind: 'hold', clip: resume.clip };
          } else {
            this._inSleep4Hold = false;
            this._microHold = false;
            this._runMicroBlock({ kind: 'clip', clip: resume.clip });
          }
        } else {
          this._inSleep4Hold = false;
          this._microHold = false;
          this._scheduleNextMicro(false);
        }
        this.updateSpriteStyle();
        this.emitDebugInfo();
        return;
      }

      if (resume.resumeArc && resume.clip) {
        this._arcResumeClip = resume.clip;
        this._arcStepStartedAt = now;
        this._frameIdx = 0;
        this._activeClipName = resume.clip;
        if (scene === 'done' && resolveDoneBand(now) === 'done-night') {
          this._arcHeld = true;
          this._arcStepTerminal = true;
        } else {
          this._arcHeld = false;
          this._arcStepTerminal = false;
        }
      } else if (resume.drowse) {
        this._arcId = 'drowse';
        this._arcStepIdx = 0;
        this._arcStepCycle = 0;
        this._arcHeld = false;
        this.applyArcStep(false);
      } else {
        this.applyArcStep(false);
      }
      this.updateSpriteStyle();
      this.emitDebugInfo();
    },

    tickInterruptChain(now) {
      const chain = this._interruptChain;
      if (!chain) return;

      if (this._overlayClip && now < this._overlayUntil) return;

      if (chain.phase === 'recovery') {
        const adv = advanceRecoveryChain(chain);
        if (!adv.done && adv.step) {
          this._haltWalkForTap();
          this.playCompanionOverlay(adv.step);
          return;
        }
        this.finishRecoveryChain(chain, now);
        return;
      }

      if (chain.phase === 'interrupt') {
        if (shouldPostInterruptYawn(chain.fromClip, chain.interruptClip)) {
          this._interruptChain = { phase: 'yawn', fromClip: chain.fromClip };
          this.playCompanionOverlay({
            ...POST_INTERRUPT_YAWN,
            durationMs: 3200,
          });
          return;
        }
        this.finishInterruptResume(chain.fromClip, now);
        return;
      }

      if (chain.phase === 'yawn') {
        this.finishInterruptResume(chain.fromClip, now);
      }
    },

    startSleepInterrupt(fromClip) {
      const tier = sleepTier(fromClip);
      if (this.isMicroActive() && tier <= 2) {
        pauseRhythmForRecovery(this._microSession);
        const def = buildSleepTapRecovery(fromClip, this._habit);
        const chain = startRecoveryChain({ ...def, fromClip });
        const step = chain.queue[0];
        if (!this.playCompanionOverlay(step)) return;
        this._interruptChain = chain;
        return;
      }

      const reaction = pickSleepInterrupt(fromClip, this._habit);
      const overlay = {
        clip: reaction.clip,
        singleCycle: reaction.singleCycle,
        singleFrame: reaction.singleFrame,
        durationMs: reaction.singleFrame ? 1200 : 2800,
        sfx: reaction.sfx,
        sfxProb: reaction.sfxProb,
      };
      if (!this.playCompanionOverlay(overlay)) return;
      this._interruptChain = {
        phase: 'interrupt',
        fromClip,
        interruptClip: reaction.clip,
      };
      if (reaction.resumeSleep) {
        this._arcResumeClip = `${reaction.resumeSleep}_${fromClip.endsWith('_r') ? 'r' : 'l'}`;
      }
    },

    getClipDef(name) {
      return (ATLAS.clips && ATLAS.clips[name]) || ATLAS.clips[FALLBACK_CLIP];
    },

    resetRoamPlan() {
      const delay = this.properties.debug
        ? 400 + Math.random() * 800
        : 2000 + Math.random() * 4000;
      this._nextWanderAt = Date.now() + delay;
    },

    measureStage() {
      const apply = (width, height) => {
        const dockH = this.properties.dockHeight || 0;
        const w = width || this._stageWidth || 0;
        const measuredH = height || 0;
        const h = dockH > 0
          ? (measuredH > 0 ? Math.min(measuredH, dockH) : dockH)
          : measuredH;
        if (w > SPRITE_PX + 8 && h > SPRITE_PX + 8) {
          this._stageWidth = w;
          this._stageHeight = h;
          this.updatePositionDisplay(true);
        }
      };

      this.createSelectorQuery()
        .in(this)
        .select('.cat-pet-stage')
        .boundingClientRect((rect) => {
          apply(rect && rect.width, rect && rect.height);
        })
        .exec();

      if (!this._stageWidth || !this._stageHeight || this._stageHeight <= SPRITE_PX + 8) {
        setTimeout(() => {
          if (!this._alive) return;
          if (this._stageWidth && this._stageHeight > SPRITE_PX + 8) return;
          this.createSelectorQuery()
            .in(this)
            .select('.cat-pet-stage')
            .boundingClientRect((rect) => {
              apply(rect && rect.width, rect && rect.height);
            })
            .exec();
        }, 120);
      }
    },

    setStageSize(width, height) {
      const dockH = this.properties.dockHeight || 0;
      const w = width || this._stageWidth || 0;
      const measuredH = height || 0;
      const h = dockH > 0
        ? (measuredH > 0 ? Math.min(measuredH, dockH) : dockH)
        : measuredH;
      if (w <= SPRITE_PX + 8 || h <= SPRITE_PX + 8) return;
      this._stageWidth = w;
      this._stageHeight = h;
      this.updatePositionDisplay(true);
    },

    _applyDockFallbackSize() {
      const dockH = this.properties.dockHeight || 0;
      if (dockH <= SPRITE_PX + 8) return false;
      let w = this._stageWidth || 0;
      if (w <= SPRITE_PX + 8) {
        try {
          const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          w = Math.round((win.windowWidth || 375) * 0.92);
        } catch (e) {
          w = 320;
        }
      }
      if (w <= SPRITE_PX + 8) return false;
      this._stageWidth = w;
      this._stageHeight = dockH;
      this.updatePositionDisplay(true);
      return true;
    },

    canRoam() {
      if (this.properties.forceClip) return false;
      if (this._isWalking && (this._walkingFromArc || this._arcWalkActive || this._microWalkFromMicro)) {
        return true;
      }
      const scene = this.properties.scene || '';
      if (scene === 'overtime') return false;
      if (this.isMicroActive() || this.isArcActive()) {
        return !!this._arcWalkActive;
      }
      return !!ROAM_SCENES[scene];
    },

    getRoamBlockedReason() {
      if (this.properties.forceClip) return 'forceClip';
      const scene = this.properties.scene || '';
      if (scene === 'overtime') return 'overtime';
      if (!ROAM_SCENES[scene]) return 'scene';
      return '';
    },

    triggerRoam() {
      if (!this.canRoam()) return false;
      this._nextWanderAt = 0;
      this.pickWanderTarget(Date.now());
      this.emitDebugInfo();
      return true;
    },

    pickWanderTarget(now, forceWalk) {
      const scene = this.properties.scene || '';
      const cfg = ROAM_SCENES[scene];
      if (!cfg && !forceWalk) return;
      if (!forceWalk) {
        this._nextWanderAt =
          now + cfg.interval[0] + Math.random() * (cfg.interval[1] - cfg.interval[0]);
        if (!cfg.always && cfg.chance && Math.random() > cfg.chance) return;
      }

      const target = roamTargetRatios(scene, this._habit);
      let tx = target.tx;
      let ty = target.ty;
      const clamped = clampRoamRatio(tx, ty);
      tx = clamped.tx;
      ty = clamped.ty;
      const dx = tx - this._posRatioX;
      const dy = ty - this._posRatioY;
      if (Math.hypot(dx, dy) < WALK_MIN_DIST) return;

      this._moveTarget = { x: tx, y: ty };
      this._walkStart = { x: this._posRatioX, y: this._posRatioY };
      this._isWalking = true;
      this._activeClipName = walkClipForRatioDelta(
        dx,
        dy,
        this._stageWidth,
        this._stageHeight,
        SPRITE_PX
      );
      this._frameIdx = 0;
      this._walkDurationMs = this.estimateWalkDuration2D();
      this._walkStartedAt = now;
    },

    estimateWalkDuration2D() {
      if (!this._moveTarget || !this._walkStart) return 1000;
      const clipDef = this.getClipDef(this._activeClipName);
      const frameCount = (clipDef && clipDef.frames && clipDef.frames.length) || 8;
      const fps = (clipDef && clipDef.fps) || 8;
      const cycleMs = clipCycleMs(frameCount, fps);
      const dx = this._moveTarget.x - this._walkStart.x;
      const dy = this._moveTarget.y - this._walkStart.y;
      const { cycleMs: totalMs } = estimateWalkCycles(
        dx,
        dy,
        this._stageWidth,
        this._stageHeight,
        frameCount,
        cycleMs,
        RENDER_PX,
        SPRITE_PX
      );
      return totalMs;
    },

    finishWalk() {
      this._isWalking = false;
      this._moveTarget = null;
      const clamped = clampRoamRatio(this._posRatioX, this._posRatioY);
      this._posRatioX = clamped.tx;
      this._posRatioY = clamped.ty;
      this.updatePositionDisplay();

      if (this.isMicroActive() && this._walkingFromArc) {
        this._walkingFromArc = false;
        if (this._arcWalkActive && this._arcWalkRemaining > 1) {
          this._arcWalkRemaining -= 1;
          wx.nextTick(() => this.triggerMicroWalk(this._microBlock));
          return;
        }
        this._arcWalkActive = false;
        this._arcWalkRemaining = 0;
        this._microWalkFromMicro = false;
        if (
          this._microSession &&
          isExcitedPatrol(this._microSession, Date.now())
        ) {
          playCompanionSfx('meow_mid', 0.15);
        }
        this._onMicroClipCycleComplete(Date.now());
        return;
      }

      if (this.isArcActive() && this._walkingFromArc) {
        if (this._ambientWalkOnly) {
          this._walkingFromArc = false;
          this._arcWalkActive = false;
          this._ambientWalkOnly = false;
          this._arcStepStartedAt = Date.now();
          return;
        }
        this._walkingFromArc = false;
        if (this._arcWalkActive && this._arcWalkRemaining > 1) {
          this._arcWalkRemaining -= 1;
          wx.nextTick(() => this.triggerArcWalk());
          return;
        }
        this._arcWalkActive = false;
        this._arcWalkRemaining = 0;
        this.advanceArcStep();
        return;
      }

      this._activeClipName = this.selectClipForContext();
      this._frameIdx = 0;
      this._cycleStartAt = Date.now();
      this._inRotation = false;
    },

    _applyWalkLerp(now) {
      if (!this._isWalking || !this._moveTarget || !this._walkStart) return false;

      const elapsed = now - (this._walkStartedAt || now);
      const duration = Math.max(1, this._walkDurationMs || 1000);
      const t = Math.min(1, elapsed / duration);
      const rawX = this._walkStart.x + (this._moveTarget.x - this._walkStart.x) * t;
      const rawY = this._walkStart.y + (this._moveTarget.y - this._walkStart.y) * t;
      const clamped = clampRoamRatio(rawX, rawY);
      this._posRatioX = clamped.tx;
      this._posRatioY = clamped.ty;

      if (t >= 1) {
        const end = clampRoamRatio(this._moveTarget.x, this._moveTarget.y);
        this._posRatioX = end.tx;
        this._posRatioY = end.ty;
        this.finishWalk();
      } else {
        this.updatePositionDisplay();
      }
      return true;
    },

    _reconcileMicroWalk() {
      if (this._isWalking && this._walkStartedAt) {
        const elapsed = Date.now() - this._walkStartedAt;
        const duration = Math.max(1, this._walkDurationMs || 1000);
        if (elapsed > duration * 1.5) {
          this._applyWalkLerp(Date.now());
        }
      }
      if (!this.isMicroActive() || !this._arcWalkActive || !this._microWalkFromMicro) return;
      if (this._isWalking || this._interruptChain) return;
      if (this._overlayClip && Date.now() < this._overlayUntil) return;
      const block = this._microBlock;
      if (!block || (block.kind !== 'walk' && block.kind !== 'microWalk')) {
        this._arcWalkActive = false;
        this._walkingFromArc = false;
        this._microWalkFromMicro = false;
        return;
      }
      this.triggerMicroWalk(block);
    },

    updateMovement(now) {
      if (this._overlayClip && now < this._overlayUntil) return;

      if (this._applyWalkLerp(now)) return;

      if (this.isMicroActive() || this.isArcActive()) return;

      if (!this.canRoam()) {
        if (this._isWalking) this.finishWalk();
        return;
      }

      if (now >= this._nextWanderAt) {
        this.pickWanderTarget(now);
      }
    },

    updatePositionDisplay(force) {
      if (!this._stageWidth || !this._stageHeight) return;
      const maxX = Math.max(0, this._stageWidth - SPRITE_PX);
      const maxY = Math.max(0, this._stageHeight - SPRITE_PX);
      const px = Math.round(this._posRatioX * maxX);
      const py = Math.round(this._posRatioY * maxY);
      const canRoam = this.canRoam();
      if (
        !force &&
        !this._isWalking &&
        px === this._lastPosPx &&
        py === this._lastPosPy &&
        canRoam === this.data.debugCanRoam
      ) {
        return;
      }
      this._lastPosPx = px;
      this._lastPosPy = py;
      this.setData({
        posX: px,
        posY: py,
        debugStageW: this._stageWidth,
        debugStageH: this._stageHeight,
        debugMaxX: maxX,
        debugMaxY: maxY,
        debugCanRoam: canRoam,
      });
      if (this.properties.debug) {
        this.emitDebugInfo();
      }
    },

    resetClipState() {
      this._frameIdx = 0;
      this._cycleStartAt = Date.now();
      this._inRotation = false;
      this._idleAlt = false;
      this._l3Phase = 0;
      this._l3LastSwitch = Date.now();
      this._l4LastOccasional = Date.now();
      this._otL1LastSwitch = Date.now();
      if (this.isMicroActive() && !this.properties.forceClip) {
        if (!this._microSession) this.resetMicroState(false);
      } else if (this.isArcActive()) {
        this.resetArcState();
      } else {
      this._activeClipName = this.selectClipForContext();
      }
      this.updateSpriteStyle();
    },

    selectClipForContext() {
      if (this.properties.forceClip) {
        return this.properties.forceClip;
      }
      if (this._isWalking && this._activeClipName) {
        return this._activeClipName;
      }

      const scene = this.properties.scene || '';
      const escalation = this.properties.escalation || 0;

      if (scene === 'overtime') {
        const level = Math.min(4, Math.max(1, escalation || 1));
        const cfg = OVERTIME_MAP[level];
        if (level === 3) return cfg.clips[this._l3Phase % 2];
        if (level === 4) return cfg.primary;
        if (level === 1) {
          return this._otL1UseAlt ? cfg.alternate : cfg.primary;
        }
        return cfg.primary;
      }

      const cfg = CONTEXT_CLIP_MAP[scene];
      if (!cfg) return FALLBACK_CLIP;

      if (this._inRotation && cfg.rotations && cfg.rotations.length) {
        return pickWeighted(this.pickRotationPool(scene, cfg.rotations)).clip;
      }

      if (scene === 'done' && this._doneUseAlt && cfg.alternatePrimary) {
        return cfg.alternatePrimary;
      }

      if (!this._inRotation && IDLE_SCENES.includes(scene)) {
        return idleClipForAlt(this._idleAlt);
      }

      return cfg.primary;
    },

    getContextConfig() {
      const scene = this.properties.scene || '';
      if (scene === 'overtime') {
        const level = Math.min(4, Math.max(1, this.properties.escalation || 1));
        return { type: 'overtime', level, cfg: OVERTIME_MAP[level] };
      }
      const cfg = CONTEXT_CLIP_MAP[scene];
      return cfg ? { type: 'normal', cfg } : null;
    },

    updateRotationClip(now) {
      if (this.properties.forceClip || this._isWalking) return;

      const ctxCfg = this.getContextConfig();
      if (!ctxCfg) return;

      if (ctxCfg.type === 'overtime') {
        const { level, cfg } = ctxCfg;
        if (level === 1 && cfg.alternateEveryMs) {
          if (now - this._otL1LastSwitch >= cfg.alternateEveryMs) {
            this._otL1UseAlt = !this._otL1UseAlt;
            this._otL1LastSwitch = now;
            this._activeClipName = this.selectClipForContext();
            this._frameIdx = 0;
          }
          return;
        }
        if (level === 2 && cfg.primaryCycleMs) {
          const elapsed = now - this._cycleStartAt;
          if (!this._inRotation && elapsed >= cfg.primaryCycleMs) {
            this._inRotation = true;
            this._cycleStartAt = now;
            this._activeClipName = pickWeighted(
              this.pickRotationPool(this.properties.scene, cfg.rotations)
            ).clip;
            this._frameIdx = 0;
          } else if (this._inRotation && elapsed >= (cfg.rotations[0].cycleMs || 12000)) {
            this._inRotation = false;
            this._cycleStartAt = now;
            this._activeClipName = cfg.primary;
            this._frameIdx = 0;
          }
          return;
        }
        if (level === 3 && cfg.alternateMs) {
          if (now - this._l3LastSwitch >= cfg.alternateMs) {
            this._l3Phase += 1;
            this._l3LastSwitch = now;
            this._activeClipName = cfg.clips[this._l3Phase % 2];
            this._frameIdx = 0;
          }
          return;
        }
        if (level === 4 && cfg.occasionalMs) {
          if (
            this._activeClipName === cfg.primary &&
            now - this._l4LastOccasional >= cfg.occasionalMs &&
            Math.random() < cfg.occasionalChance
          ) {
            this._activeClipName = cfg.occasionalClip;
            this._frameIdx = 0;
            this._l4LastOccasional = now;
          } else if (
            this._activeClipName === cfg.occasionalClip &&
            this._frameIdx >= (this.getClipDef(cfg.occasionalClip).frames.length - 1)
          ) {
            this._activeClipName = cfg.primary;
            this._frameIdx = 0;
          }
          return;
        }
        return;
      }

      const { cfg } = ctxCfg;
      const elapsed = now - this._cycleStartAt;

      if (cfg.yawnIntervalMs && cfg.yawnClip) {
        if (this._activeClipName === cfg.yawnClip) {
          const yawnDef = this.getClipDef(cfg.yawnClip);
          if (this._frameIdx >= yawnDef.frames.length - 1) {
            this._activeClipName = IDLE_SCENES.includes(this.properties.scene)
              ? idleClipForAlt(this._idleAlt)
              : cfg.primary;
            this._frameIdx = 0;
            this._cycleStartAt = now;
          }
          return;
        }
        if (now - this._nightLastYawn >= cfg.yawnIntervalMs) {
          this._nightLastYawn = now;
          this._activeClipName = cfg.yawnClip;
          this._frameIdx = 0;
          return;
        }
      }

      if (!this._inRotation) {
        if (elapsed >= cfg.primaryCycleMs) {
          if (Math.random() < cfg.rotationChance) {
            this._inRotation = true;
            this._cycleStartAt = now;
            if (this.properties.scene === 'done' && cfg.alternatePrimary) {
              this._doneUseAlt = !this._doneUseAlt;
            }
            this._activeClipName = this.selectClipForContext();
            this._frameIdx = 0;
          } else {
            if (IDLE_SCENES.includes(this.properties.scene)) {
              this._idleAlt = !this._idleAlt;
              this._activeClipName = idleClipForAlt(this._idleAlt);
              this._frameIdx = 0;
            }
            this._cycleStartAt = now;
          }
        }
      } else {
        const rot = cfg.rotations[0];
        const rotMs = rot ? rot.cycleMs : cfg.primaryCycleMs;
        if (elapsed >= rotMs) {
          this._inRotation = false;
          this._cycleStartAt = now;
          if (this.properties.scene === 'done' && cfg.alternatePrimary) {
            this._doneUseAlt = !this._doneUseAlt;
          }
          if (IDLE_SCENES.includes(this.properties.scene)) {
            this._idleAlt = !this._idleAlt;
          }
          this._activeClipName = this.selectClipForContext();
          this._frameIdx = 0;
        }
      }
    },

    getCurrentClipName() {
      if (this._overlayClip && Date.now() < this._overlayUntil) {
        return this._overlayClip;
      }
      if (this._overlayClip && Date.now() >= this._overlayUntil) {
        this._overlayClip = null;
        this._overlaySingleFrame = false;
        this._overlaySingleCycle = false;
      }
      return this._activeClipName;
    },

    tickFrame() {
      const now = Date.now();
      if (this._interruptChain) {
        this.tickInterruptChain(now);
      }
      if (!this._isWalking) {
        if (this.isMicroActive()) {
          this.updateMicroFsm(now);
        } else if (this.isArcActive()) {
          this.updateArcFsm(now);
        } else {
      this.updateRotationClip(now);
        }
        this.updateCompanionLayer(now);
      }

      const clipName = this.getCurrentClipName();
      const clipDef = this.getClipDef(clipName);
      if (!clipDef || !clipDef.frames || !clipDef.frames.length) return;

      if (this._overlaySingleFrame) {
        this._frameIdx = 0;
        return;
      }

      if (this._overlaySingleCycle) {
        this._frameIdx += 1;
        if (this._frameIdx >= clipDef.frames.length) {
          this._overlayClip = null;
          this._overlaySingleCycle = false;
          this._frameIdx = 0;
        }
        return;
      }

      this._frameIdx += 1;
      if (this._frameIdx >= clipDef.frames.length) {
        this._frameIdx = clipDef.loop === false ? clipDef.frames.length - 1 : 0;
        if (this._overlayClip && Date.now() >= this._overlayUntil) {
          this._overlayClip = null;
          this._overlaySingleFrame = false;
          this._overlaySingleCycle = false;
        }
      }
    },

    updateSpriteStyle() {
      const clipName = this.getCurrentClipName();
      const clipDef = this.getClipDef(clipName);
      if (!clipDef || !clipDef.frames || !clipDef.frames.length) return;

      const frameKey = clipDef.frames[this._frameIdx] ?? clipDef.frames[0];
      const { x, y } = frameToOffset(frameKey);
      if (x === this._lastSpriteX && y === this._lastSpriteY) return;
      this._lastSpriteX = x;
      this._lastSpriteY = y;
      this.setData({ spriteX: x, spriteY: y });
      this.emitDebugInfo();
    },

    emitDebugInfo() {
      if (!this.properties.debug) return;

      const clipName = this.getCurrentClipName();
      const clipDef = this.getClipDef(clipName);
      const frameCount = clipDef && clipDef.frames ? clipDef.frames.length : 0;
      const payload = {
        clip: clipName,
        frame: this._frameIdx,
        frameCount,
        overlay: !!(this._overlayClip && Date.now() < this._overlayUntil),
        scene: this.properties.scene || '',
        escalation: this.properties.escalation || 0,
        appState: this.properties.appState || 'idle',
        forced: !!this.properties.forceClip,
        posRatioX: Math.round(this._posRatioX * 100) / 100,
        posRatioY: Math.round(this._posRatioY * 100) / 100,
        posX: this._lastPosPx,
        posY: this._lastPosPy,
        stageWidth: this._stageWidth || 0,
        stageHeight: this._stageHeight || 0,
        maxX: Math.max(0, (this._stageWidth || 0) - SPRITE_PX),
        maxY: Math.max(0, (this._stageHeight || 0) - SPRITE_PX),
        canRoam: this.canRoam(),
        roamBlocked: this.getRoamBlockedReason(),
        walking: !!this._isWalking,
        microWalk: !!this._microWalkFromMicro,
        moveTarget: this._moveTarget,
        walkClip: this._isWalking ? this._activeClipName : '',
        habit: this._habit
          ? {
              affinity: this._habit.affinity,
              napCorner: this._habit.napCorner,
              groomer: this._habit.groomer,
              touchiness: this._habit.touchiness,
              dayMood: this._habit.dayMood,
            }
          : null,
        arcId: this._arcId || '',
        arcStep: this._arcStepIdx,
        arcCycle: this._arcStepCycle,
        sleepTier: isSleepClip(this.getCurrentClipName())
          ? sleepTier(this.getCurrentClipName())
          : 0,
        doneBand: this.resolveDoneBandForPet(Date.now()),
        useArcFsm: !!this.isArcActive(),
        useMicroFsm: !!this.isMicroActive(),
        excitedPatrol: this._microSession
          ? isExcitedPatrol(this._microSession, Date.now())
          : false,
        microBlockKind: (this._microBlock && this._microBlock.kind) || '',
        interestId:
          (this._microBlock && this._microBlock.target && this._microBlock.target.interestId) || '',
        tapCount30s: this._microSession ? this._microSession.tapTimes.length : 0,
        inSleep4Hold: !!this._inSleep4Hold,
      };

      const key = `${payload.clip}|${payload.frame}|${payload.walking}|${payload.posX}|${payload.posY}|${payload.habit && payload.habit.dayMood}`;
      if (key === this._lastDebugKey) return;
      this._lastDebugKey = key;
      this.triggerEvent('debugchange', payload);
    },

    startLoop() {
      if (this._loopTimer) {
        clearTimeout(this._loopTimer);
        this._loopTimer = null;
      }

      const loop = () => {
        if (!this._alive) {
          this._loopTimer = null;
          return;
        }

        const now = Date.now();
        this.updateMovement(now);
        this._reconcileMicroWalk();

        const clipName = this.getCurrentClipName();
        const clipDef = this.getClipDef(clipName);
        const fps = (clipDef && clipDef.fps) || 5;
        const frameMs = clipFrameMs(fps);

        if (!this._lastTick || now - this._lastTick >= frameMs) {
          this._lastTick = now;
          this.tickFrame();
          this.updateSpriteStyle();
        }

        this._loopTimer = setTimeout(loop, 32);
      };

      this._loopTimer = setTimeout(loop, 32);
    },

    onCatTap(e) {
      if (this.isMicroActive() || this.isArcActive()) {
        this.onArcTap(e);
        return;
      }
      const zone = this.zoneFromEvent(e);
      if (zone === 'head') {
        this.onHeadPat();
        return;
      }
      if (zone === 'tail') {
        this.onComboTap();
        return;
      }
      this.onBodyTap();
    },

    onArcTap(e) {
      if (this._interruptChain) return;

      const now = Date.now();
      if (this._isOverlayActive(now)) return;

      const zone = e ? this.zoneFromEvent(e) : 'body';
      const isDouble =
        this._arcLastTapAt && now - this._arcLastTapAt < DOUBLE_TAP_MS;
      this._arcLastTapAt = now;

      if (isDouble && now >= this._doubleTapCooldownUntil) {
        this._haltWalkForTap();
        if (
          this.playCompanionOverlay({
            clip: 'wash_sit',
            singleCycle: true,
            durationMs: 2800,
            sfx: 'wash',
            sfxProb: 0.35,
          })
        ) {
          this._doubleTapCooldownUntil = now + DOUBLE_TAP_WASH_COOLDOWN_MS;
          this._tapCooldownUntil = now + TAP_COOLDOWN_MS;
          return;
        }
      }

      if (this.isMicroActive() && (zone === 'head' || zone === 'body' || zone === 'tail')) {
        if (!this._microSession) this._microSession = createMicroSession();
        const tapResult = recordTap(this._microSession, now);
        if (tapResult.triggeredPatrol) {
          this._haltWalkForTap();
          playCompanionSfx('meow_mid', 1);
          this._microHold = false;
          this._inSleep4Hold = false;
          this._enterExcitedRoam(now);
          this._scheduleNextMicro(false);
        }
      }

      if (now < this._tapCooldownUntil) return;

      this._haltWalkForTap();

      const clipName = this.getCurrentClipName();
      if (isSleepClip(clipName)) {
        this.startSleepInterrupt(clipName);
        this._tapCooldownUntil = Date.now() + TAP_COOLDOWN_MS;
        return;
      }

      if (this.isMicroActive()) {
        if (!this._microSession) this._microSession = createMicroSession();
        pauseRhythmForRecovery(this._microSession);
        const rhythm = this._microSession.rhythm;
        const def = buildAwakeTapRecovery({
          scene: this.properties.scene || '',
          escalation: this.properties.escalation || 0,
          currentClip: clipName,
          segment: rhythm && rhythm.segment,
          zone,
        });
        const chain = startRecoveryChain({ ...def, fromClip: clipName });
        const step = chain.queue[0];
        if (!this.playCompanionOverlay(step)) {
          this._interruptChain = null;
          return;
        }
        this._interruptChain = chain;
        this._tapCooldownUntil = Date.now() + TAP_COOLDOWN_MS;
        return;
      }

      const reaction = pickAwakeTap(
        this.properties.scene || '',
        this._arcId || '',
        clipName,
        this.properties.escalation || 0
      );
      if (!this.playCompanionOverlay({
        clip: reaction.clip,
        singleCycle: reaction.singleCycle,
        singleFrame: reaction.singleFrame,
        durationMs: reaction.singleFrame ? 1200 : 2600,
        sfx: reaction.sfx,
        sfxProb: reaction.sfxProb,
      })) {
        return;
      }
      this._tapCooldownUntil = Date.now() + TAP_COOLDOWN_MS;
    },

    onBodyTap() {
      if (this._isOverlayActive()) return;
      if (Date.now() < this._tapCooldownUntil) return;
      this._haltWalkForTap();

      const pool = this.getTapPool();
      if (!pool || !pool.length) return;

      const pick = pickWeighted(pool);
      const duration =
        OVERLAY_MIN_MS + Math.floor(Math.random() * (OVERLAY_MAX_MS - OVERLAY_MIN_MS));

      this._overlayClip = pick.clip;
      this._overlaySingleFrame = !!pick.singleFrame;
      this._overlaySingleCycle = !!pick.singleCycle;
      this._overlayUntil = Date.now() + duration;
      this._frameIdx = 0;
      this._tapCooldownUntil = Date.now() + TAP_COOLDOWN_MS;
      this._playMeowClipSfx(pick.clip);
      this.updateSpriteStyle();
      this.emitDebugInfo();
    },

    onHeadPat() {
      if (this._isOverlayActive()) return;
      if (Date.now() < this._headPatCooldownUntil) return;
      this._haltWalkForTap();
      const touchiness = (this._habit && this._habit.touchiness) || 'low';
      const reaction = pickHeadPatReaction(touchiness);
      if (!this.playCompanionOverlay(reaction)) return;
      if (touchiness === 'high' && reaction.clip !== 'hiss_l' && reaction.clip !== 'scratch_l') {
        playCompanionSfx('meow_loud', 0.5 + Math.random() * 0.5);
      }
      this._headPatCooldownUntil = Date.now() + HEAD_PAT_COOLDOWN_MS;
    },

    onComboTap() {
      if (this._isOverlayActive()) return;
      const now = Date.now();
      this._comboTimes = (this._comboTimes || []).filter((t) => now - t < COMBO_WINDOW_MS);
      this._comboTimes.push(now);
      if (this._comboTimes.length < COMBO_TAP_COUNT) return;
      if (now < this._comboCooldownUntil) {
        this._comboTimes = [];
        return;
      }
      this._haltWalkForTap();
      this._comboTimes = [];
      const reaction = comboClipForScene(this.properties.scene || '');
      if (!this.playCompanionOverlay(reaction)) return;
      this._comboCooldownUntil = Date.now() + COMBO_COOLDOWN_MS;
    },

    onTap() {
      this.onBodyTap();
    },

    simulateTap() {
      this.onBodyTap();
    },

    clearTapCooldown() {
      this._tapCooldownUntil = 0;
    },

    getTapPool() {
      const scene = this.properties.scene || '';
      const escalation = this.properties.escalation || 0;

      if (scene === 'overtime') {
        return escalation >= 3 ? TAP_POOLS.overtimeHigh : TAP_POOLS.overtimeLow;
      }
      if (scene === 'done') return TAP_POOLS.done;
      if (TAP_POOLS[scene]) return TAP_POOLS[scene];
      return TAP_POOLS.beforeWork;
    },
  },
});
