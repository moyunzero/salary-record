Component({
  properties: {
    active: { type: Boolean, value: false },
    particleCount: { type: Number, value: 30 },
    durationMs: { type: Number, value: 3000 },
  },

  data: {
    particles: [],
  },

  observers: {
    active(active) {
      if (active) {
        this.startRain();
      } else {
        this.clearTimer();
      }
    },
  },

  lifetimes: {
    detached() {
      this.clearTimer();
    },
  },

  methods: {
    buildParticles() {
      const count = Math.min(30, Math.max(1, this.properties.particleCount || 30));
      const particles = [];
      for (let id = 0; id < count; id += 1) {
        particles.push({
          id,
          left: 5 + Math.random() * 90,
          delay: Math.random() * 400,
          duration: 2200 + Math.random() * 800,
          type: id % 3 === 0 ? 'yen' : 'coin',
        });
      }
      this.setData({ particles });
    },

    startRain() {
      this.clearTimer();
      this.buildParticles();
      this._timer = setTimeout(() => {
        this._timer = null;
        this.triggerEvent('complete');
      }, this.properties.durationMs || 3000);
    },

    clearTimer() {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    },
  },
});
