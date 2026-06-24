/**
 * Generate 81×81 tabBar PNG icons (filled_soft style).
 * Run: node scripts/generate-tab-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 81;
const OUT = path.join(__dirname, '../miniprogram/assets/icons');

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function createBuffer() {
  const buf = Buffer.alloc(SIZE * SIZE * 4, 0);
  const api = {
    set(x, y, r, g, b, a = 255) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      const i = (y * SIZE + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    },
    fillCircle(cx, cy, r, rgb, alpha = 255) {
      const [R, G, B] = rgb;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r * r) this.set(x, y, R, G, B, alpha);
        }
      }
    },
    fillRoundRect(x, y, w, h, rad, rgb, alpha = 255) {
      const [R, G, B] = rgb;
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          const nx = px < x + rad ? x + rad - px : px >= x + w - rad ? px - (x + w - rad - 1) : 0;
          const ny = py < y + rad ? y + rad - py : py >= y + h - rad ? py - (y + h - rad - 1) : 0;
          if (nx * nx + ny * ny <= rad * rad || (nx === 0 && ny === 0)) {
            this.set(px, py, R, G, B, alpha);
          }
        }
      }
    },
    fillRect(x, y, w, h, rgb, alpha = 255) {
      const [R, G, B] = rgb;
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) this.set(px, py, R, G, B, alpha);
      }
    },
    toPNG() {
      const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
      for (let y = 0; y < SIZE; y++) {
        raw[y * (SIZE * 4 + 1)] = 0;
        buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
      }
      const compressed = zlib.deflateSync(raw);
      const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(SIZE, 0);
      ihdr.writeUInt32BE(SIZE, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      ihdr[10] = 0;
      ihdr[11] = 0;
      ihdr[12] = 0;
      const chunks = [
        chunk('IHDR', ihdr),
        chunk('IDAT', compressed),
        chunk('IEND', Buffer.alloc(0)),
      ];
      return Buffer.concat([signature, ...chunks]);
    },
  };
  return api;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crcData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function drawHome(c, color) {
  c.fillRoundRect(28, 38, 26, 22, 4, color);
  for (let y = 22; y <= 42; y++) {
    for (let x = 20; x <= 60; x++) {
      const t = (x - 40) / 20;
      const roofY = 42 - Math.abs(t) * 20;
      if (y >= roofY && y <= 42) c.set(x, y, ...color, 255);
    }
  }
}

function drawRecord(c, color) {
  c.fillRoundRect(24, 22, 34, 42, 5, color);
  c.fillRect(30, 32, 22, 3, hexToRgb('#0a101f'));
  c.fillRect(30, 40, 18, 3, hexToRgb('#0a101f'));
  c.fillRect(30, 48, 20, 3, hexToRgb('#0a101f'));
  c.fillCircle(52, 28, 6, color);
}

function drawIncome(c, color) {
  c.fillRoundRect(22, 48, 10, 16, 3, color);
  c.fillRoundRect(36, 38, 10, 26, 3, color);
  c.fillRoundRect(50, 28, 10, 36, 3, color);
}

function drawProfile(c, color) {
  c.fillCircle(40, 30, 12, color);
  c.fillRoundRect(24, 46, 32, 20, 10, color);
}

const ICONS = [
  ['tab-home', drawHome],
  ['tab-profile', drawProfile],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [name, draw] of ICONS) {
  for (const [suffix, hex] of [
    ['', '#94a3b8'],
    ['-active', '#22c55e'],
  ]) {
    const c = createBuffer();
    draw(c, hexToRgb(hex));
    fs.writeFileSync(path.join(OUT, `${name}${suffix}.png`), c.toPNG());
  }
}

console.log(`Generated ${ICONS.length * 2} icons in ${OUT}`);
