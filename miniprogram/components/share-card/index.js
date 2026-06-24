const { saveImageToAlbum, shareImage } = require('../../services/platform');
const { isDevelopEnv } = require('../../utils/env');

function getPixelRatio() {
  if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 2;
  return 2;
}

function drawShareCard(ctx, w, h, data) {
  const grad = ctx.createLinearGradient(0, 0, w * 0.6, h);
  grad.addColorStop(0, 'rgba(34, 197, 94, 0.22)');
  grad.addColorStop(0.45, 'rgba(10, 16, 31, 0.96)');
  grad.addColorStop(1, '#0a101f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
  ctx.fillRect(0, 0, w, 4);

  ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 13px sans-serif';
  ctx.fillText('薪时宝', 24, 40);

  ctx.fillStyle = '#86efac';
  ctx.font = '11px sans-serif';
  ctx.fillText('今日血汗', 24, 68);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText(`¥${data.earned || '0.00'}`, 24, 118);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  const meta = `${data.startTime || ''} – ${data.endTime || ''} · 有效时薪 ¥${data.effectiveHourly || '0.00'}`;
  ctx.fillText(meta, 24, 148);

  ctx.fillStyle = '#475569';
  ctx.font = '10px sans-serif';
  ctx.fillText('数据来自你亲手搬的每一块砖', 24, h - 20);
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    payload: { type: Object, value: null },
  },

  data: {
    exportPath: '',
    drawing: false,
    showDevHint: false,
  },

  lifetimes: {
    attached() {
      this.setData({ showDevHint: isDevelopEnv() });
    },
  },

  observers: {
    'visible, payload': function (visible, payload) {
      if (visible && payload) {
        wx.nextTick(() => this.renderCard());
      }
    },
  },

  methods: {
    preventMove() {},

    ensureCanvas() {
      return new Promise((resolve, reject) => {
        if (this._canvas && this._ctx) {
          resolve();
          return;
        }
        const query = this.createSelectorQuery();
        query
          .select('#shareCanvas')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (!res || !res[0] || !res[0].node) {
              reject(new Error('canvas missing'));
              return;
            }
            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            const dpr = getPixelRatio();
            const width = res[0].width || 375;
            const height = res[0].height || 500;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
            this._canvas = canvas;
            this._ctx = ctx;
            this._layoutW = width;
            this._layoutH = height;
            resolve();
          });
      });
    },

    renderCard() {
      if (this.data.drawing) return;
      this.setData({ drawing: true, exportPath: '' });
      this.ensureCanvas()
        .then(() => {
          const data = this.properties.payload || {};
          drawShareCard(this._ctx, this._layoutW, this._layoutH, data);
          const dpr = getPixelRatio();
          return new Promise((resolve, reject) => {
            wx.canvasToTempFilePath(
              {
                canvas: this._canvas,
                destWidth: this._layoutW * dpr,
                destHeight: this._layoutH * dpr,
                success: resolve,
                fail: reject,
              },
              this
            );
          });
        })
        .then((res) => {
          this.setData({ exportPath: res.tempFilePath, drawing: false });
          this.triggerEvent('exported', { path: res.tempFilePath });
        })
        .catch(() => {
          this.setData({ drawing: false });
          wx.showToast({ title: '炫耀图没生成出来，待会再晒', icon: 'none' });
        });
    },

    onShareTap() {
      const path = this.data.exportPath;
      if (!path) return;
      this.triggerEvent('shared', { path });
      shareImage(path);
    },

    onSaveTap() {
      const path = this.data.exportPath;
      if (!path) return;
      saveImageToAlbum(path);
    },

    onDismiss() {
      this.triggerEvent('close');
    },
  },
});
