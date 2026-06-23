const ATLAS = require('../../assets/cat-pet/cat1-atlas.json');

const DISPLAY_SIZE = 64;
const TAP_COOLDOWN_MS = 8000;
const OVERLAY_MIN_MS = 2000;
const OVERLAY_MAX_MS = 3000;
const MEOW_REMINDER_MS = 60000;
const FALLBACK_CLIP = 'rest_sit_down';

const CONTEXT_CLIP_MAP = {
  beforeWork: {
    primary: 'walk_down',
    primaryCycleMs: 20000,
    rotations: [
      { clip: 'rest_sit_down', cycleMs: 8000, weight: 0.5 },
      { clip: 'eat_down', cycleMs: 8000, weight: 0.5 },
    ],
    rotationChance: 0.1,
  },
  onShift: {
    primary: 'rest_sit_down',
    primaryCycleMs: 25000,
    rotations: [
      { clip: 'wash_sit_down', cycleMs: 8000, weight: 0.85 },
      { clip: 'itch', cycleMs: 8000, weight: 0.15 },
    ],
    rotationChance: 0.15,
  },
  lunch: {
    primary: 'eat_down',
    primaryCycleMs: 15000,
    rotations: [
      { clip: 'sleep2_l_down', cycleMs: 20000, weight: 0.5 },
      { clip: 'rest_lie_down', cycleMs: 20000, weight: 0.5 },
    ],
    rotationChance: 1,
  },
  dinner: {
    primary: 'eat_down',
    primaryCycleMs: 15000,
    rotations: [
      { clip: 'rest_sit_down', cycleMs: 12000, weight: 0.5 },
      { clip: 'wash_sit_down', cycleMs: 12000, weight: 0.5 },
    ],
    rotationChance: 1,
  },
  nightShift: {
    primary: 'rest_sit_down',
    primaryCycleMs: 30000,
    rotations: [{ clip: 'wash_sit_down', cycleMs: 8000, weight: 1 }],
    rotationChance: 1,
    yawnIntervalMs: 45000,
    yawnClip: 'yawn_sit_down',
  },
  done: {
    primary: 'sleep1_l_down',
    primaryCycleMs: 30000,
    rotations: [{ clip: 'rest_lie_down', cycleMs: 30000, weight: 1 }],
    rotationChance: 1,
    alternatePrimary: 'sleep4_l_down',
  },
};

const OVERTIME_MAP = {
  1: {
    primary: 'yawn_sit_down',
    alternate: 'yawn_stand_down',
    alternateEveryMs: 8000,
  },
  2: {
    primary: 'meow_stand_down',
    primaryCycleMs: 12000,
    rotations: [{ clip: 'yawn_sit_down', cycleMs: 12000, weight: 1 }],
    rotationChance: 1,
  },
  3: {
    clips: ['hiss_left', 'paw_attack_down'],
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
    { clip: 'meow_stand_down', weight: 0.7 },
    { clip: 'paw_attack_down', weight: 0.2 },
    { clip: 'itch', weight: 0.1 },
  ],
  onShift: [
    { clip: 'meow_stand_down', weight: 0.7 },
    { clip: 'paw_attack_down', weight: 0.2 },
    { clip: 'itch', weight: 0.1 },
  ],
  nightShift: [
    { clip: 'meow_stand_down', weight: 0.7 },
    { clip: 'paw_attack_down', weight: 0.2 },
    { clip: 'itch', weight: 0.1 },
  ],
  lunch: [
    { clip: 'meow_sit_down', weight: 0.5 },
    { clip: 'eat_down', weight: 0.5, singleCycle: true },
  ],
  dinner: [
    { clip: 'meow_sit_down', weight: 0.5 },
    { clip: 'eat_down', weight: 0.5, singleCycle: true },
  ],
  overtimeLow: [
    { clip: 'meow_stand_down', weight: 0.5 },
    { clip: 'yawn_sit_down', weight: 0.5 },
  ],
  overtimeHigh: [
    { clip: 'paw_attack_down', weight: 0.7 },
    { clip: 'hiss_left', weight: 0.3, singleFrame: true },
  ],
  done: [
    { clip: 'rest_lie_down', weight: 0.5 },
    { clip: 'sleep1_l_down', weight: 0.25 },
    { clip: 'sleep4_l_down', weight: 0.25 },
  ],
};

function getPixelRatio() {
  if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 2;
  return 2;
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
    context: { type: String, value: 'beforeWork' },
    escalation: { type: Number, value: 0 },
    appState: { type: String, value: 'idle' },
  },

  data: {},

  observers: {
    'context, escalation': function () {
      this.resetClipState();
      this.updateMeowReminder();
    },
    appState: function () {
      this.updateMeowReminder();
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

  methods: {
    init() {
      this._frameIdx = 0;
      this._lastTick = 0;
      this._cycleStartAt = Date.now();
      this._activeClipName = FALLBACK_CLIP;
      this._inRotation = false;
      this._l3Phase = 0;
      this._l3LastSwitch = Date.now();
      this._l4LastOccasional = Date.now();
      this._doneUseAlt = false;
      this._otL1UseAlt = false;
      this._otL1LastSwitch = Date.now();
      this._nightLastYawn = 0;
      this._tapCooldownUntil = 0;
      this._overlayUntil = 0;
      this._overlayClip = null;
      this._overlaySingleFrame = false;
      this._overlaySingleCycle = false;

      wx.nextTick(() => {
        this.ensureCanvas()
          .then(() => this.loadAtlasImage())
          .then(() => {
            this.resetClipState();
            this.startLoop();
            this.updateMeowReminder();
          })
          .catch(() => {});
      });
    },

    teardown() {
      if (this._rafId && this._canvas) {
        this._canvas.cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      this.clearMeowReminder();
      this._canvas = null;
      this._ctx = null;
      this._atlasImage = null;
    },

    ensureCanvas() {
      return new Promise((resolve, reject) => {
        if (this._canvas && this._ctx) {
          resolve();
          return;
        }
        const query = this.createSelectorQuery();
        query
          .select('#catCanvas')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (!res || !res[0] || !res[0].node) {
              reject(new Error('canvas missing'));
              return;
            }
            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            const dpr = getPixelRatio();
            const width = DISPLAY_SIZE;
            const height = DISPLAY_SIZE;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
            ctx.imageSmoothingEnabled = false;
            this._canvas = canvas;
            this._ctx = ctx;
            resolve();
          });
      });
    },

    loadAtlasImage() {
      return new Promise((resolve, reject) => {
        if (this._atlasImage) {
          resolve();
          return;
        }
        const img = this._canvas.createImage();
        img.onload = () => {
          this._atlasImage = img;
          resolve();
        };
        img.onerror = reject;
        img.src = '/assets/cat-pet/cat1-atlas.png';
      });
    },

    getClipDef(name) {
      return (ATLAS.clips && ATLAS.clips[name]) || ATLAS.clips[FALLBACK_CLIP];
    },

    resetClipState() {
      this._frameIdx = 0;
      this._cycleStartAt = Date.now();
      this._inRotation = false;
      this._l3Phase = 0;
      this._l3LastSwitch = Date.now();
      this._l4LastOccasional = Date.now();
      this._otL1LastSwitch = Date.now();
      this._activeClipName = this.selectClipForContext();
    },

    selectClipForContext() {
      const context = this.properties.context || '';
      const escalation = this.properties.escalation || 0;

      if (context === 'overtime') {
        const level = Math.min(4, Math.max(1, escalation || 1));
        const cfg = OVERTIME_MAP[level];
        if (level === 3) return cfg.clips[this._l3Phase % 2];
        if (level === 4) return cfg.primary;
        if (level === 1) {
          return this._otL1UseAlt ? cfg.alternate : cfg.primary;
        }
        return cfg.primary;
      }

      const cfg = CONTEXT_CLIP_MAP[context];
      if (!cfg) return FALLBACK_CLIP;

      if (this._inRotation && cfg.rotations && cfg.rotations.length) {
        return pickWeighted(cfg.rotations).clip;
      }

      if (context === 'done' && this._doneUseAlt && cfg.alternatePrimary) {
        return cfg.alternatePrimary;
      }

      return cfg.primary;
    },

    getContextConfig() {
      const context = this.properties.context || '';
      if (context === 'overtime') {
        const level = Math.min(4, Math.max(1, this.properties.escalation || 1));
        return { type: 'overtime', level, cfg: OVERTIME_MAP[level] };
      }
      const cfg = CONTEXT_CLIP_MAP[context];
      return cfg ? { type: 'normal', cfg } : null;
    },

    updateRotationClip(now) {
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
            this._activeClipName = pickWeighted(cfg.rotations).clip;
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
            this._activeClipName = cfg.primary;
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
            if (this.properties.context === 'done' && cfg.alternatePrimary) {
              this._doneUseAlt = !this._doneUseAlt;
            }
            this._activeClipName = this.selectClipForContext();
            this._frameIdx = 0;
          } else {
            this._cycleStartAt = now;
          }
        }
      } else {
        const rot = cfg.rotations[0];
        const rotMs = rot ? rot.cycleMs : cfg.primaryCycleMs;
        if (elapsed >= rotMs) {
          this._inRotation = false;
          this._cycleStartAt = now;
          if (this.properties.context === 'done' && cfg.alternatePrimary) {
            this._doneUseAlt = !this._doneUseAlt;
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
      this.updateRotationClip(now);

      const clipName = this.getCurrentClipName();
      const clipDef = this.getClipDef(clipName);
      if (!clipDef || !clipDef.frames || !clipDef.frames.length) return;

      if (this._overlaySingleFrame) {
        this._frameIdx = 0;
        return;
      }

      if (this._overlaySingleCycle) {
        if (this._frameIdx >= clipDef.frames.length - 1) {
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

    drawFrame() {
      if (!this._ctx || !this._atlasImage) return;

      const clipName = this.getCurrentClipName();
      const clipDef = this.getClipDef(clipName);
      if (!clipDef) return;

      const frameKey = String(clipDef.frames[this._frameIdx] ?? clipDef.frames[0]);
      const rect = ATLAS.frames[frameKey];
      if (!rect) return;

      const ctx = this._ctx;
      ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
      ctx.drawImage(
        this._atlasImage,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        DISPLAY_SIZE,
        DISPLAY_SIZE
      );
    },

    startLoop() {
      if (!this._canvas) return;

      const loop = (ts) => {
        if (!this._canvas) return;

        const clipName = this.getCurrentClipName();
        const clipDef = this.getClipDef(clipName);
        const fps = (clipDef && clipDef.fps) || 5;
        const frameMs = 1000 / fps;

        if (!this._lastTick || ts - this._lastTick >= frameMs) {
          this._lastTick = ts;
          this.tickFrame();
          this.drawFrame();
        }

        this._rafId = this._canvas.requestAnimationFrame(loop);
      };

      this._rafId = this._canvas.requestAnimationFrame(loop);
    },

    onTap() {
      if (Date.now() < this._tapCooldownUntil) return;

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
      this.drawFrame();
    },

    getTapPool() {
      const context = this.properties.context || '';
      const escalation = this.properties.escalation || 0;

      if (context === 'overtime') {
        return escalation >= 3 ? TAP_POOLS.overtimeHigh : TAP_POOLS.overtimeLow;
      }
      if (context === 'done') return TAP_POOLS.done;
      if (TAP_POOLS[context]) return TAP_POOLS[context];
      return TAP_POOLS.beforeWork;
    },

    updateMeowReminder() {
      const shouldRemind =
        this.properties.context === 'lunch' && this.properties.appState === 'working';

      if (shouldRemind) {
        if (!this._meowReminderTimer) {
          this._meowReminderTimer = setInterval(() => {
            if (Date.now() < this._tapCooldownUntil) return;
            this._overlayClip = 'meow_stand_down';
            this._overlaySingleFrame = false;
            this._overlayUntil = Date.now() + 2500;
            this._frameIdx = 0;
            this.drawFrame();
          }, MEOW_REMINDER_MS);
        }
      } else {
        this.clearMeowReminder();
      }
    },

    clearMeowReminder() {
      if (this._meowReminderTimer) {
        clearInterval(this._meowReminderTimer);
        this._meowReminderTimer = null;
      }
    },
  },
});
