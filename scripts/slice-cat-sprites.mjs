/**
 * Build runtime cat sprite sheet + atlas data from labeled source art.
 * Uses cat 16x16 with text.png grid (80px label gutter) — same layout as cat 1.png.
 * Run: node scripts/slice-cat-sprites.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'miniprogram/assets/cat-pet');
const MANIFEST_PATH = path.join(__dirname, 'cat-pet-clips.manifest.json');

const COLS = 11;
const CELL = 32;
const SPRITE = 32;
const OFFSET = 0;
const GUTTER = 80;
const FRAME_COUNT = 583;

const VARIANTS = [
  {
    id: 'cat1',
    labeled: 'cat-pet/cat 16x16 with text.png',
    sheet: 'cat-pet/cat 1.png',
    outSheet: 'cat1-sheet.png',
  },
  {
    id: 'cat1.6',
    labeled: 'cat-pet/cat 1.6.png',
    sheet: 'cat-pet/cat 1.6.png',
    outSheet: 'cat1.6-sheet.png',
  },
  {
    id: 'cat1.9',
    labeled: 'cat-pet/cat 1.9.png',
    sheet: 'cat-pet/cat 1.9.png',
    outSheet: 'cat1.9-sheet.png',
  },
];

function frameIndexToSourceRect(index, gutter = 0) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    left: gutter + col * CELL + OFFSET,
    top: row * CELL + OFFSET,
    width: SPRITE,
    height: SPRITE,
    x: col * CELL + OFFSET,
    y: row * CELL + OFFSET,
    w: SPRITE,
    h: SPRITE,
  };
}

function collectFrameIndices(manifest) {
  const set = new Set();
  for (const clip of Object.values(manifest)) {
    for (const idx of clip.frames) set.add(idx);
  }
  return [...set].sort((a, b) => a - b);
}

async function verifyLabeledAlignment(variant) {
  const labeledPath = path.join(ROOT, variant.labeled);
  const sheetPath = path.join(ROOT, variant.sheet);
  if (!variant.labeled.includes('16x16')) return;

  const sample = [0, 44, 66, 77, 451];
  for (const index of sample) {
    const labeledRect = frameIndexToSourceRect(index, GUTTER);
    const sheetRect = frameIndexToSourceRect(index, 0);
    const a = await sharp(labeledPath)
      .extract({
        left: labeledRect.left,
        top: labeledRect.top,
        width: SPRITE,
        height: SPRITE,
      })
      .raw()
      .toBuffer();
    const b = await sharp(sheetPath)
      .extract({
        left: sheetRect.left,
        top: sheetRect.top,
        width: SPRITE,
        height: SPRITE,
      })
      .raw()
      .toBuffer();
    if (!a.equals(b)) {
      throw new Error(`${variant.id}: frame ${index} mismatch between labeled sheet and ${variant.sheet}`);
    }
  }
}

async function buildVariant(variant, manifest, frameIndices) {
  const sheetPath = path.join(ROOT, variant.sheet);
  const meta = await sharp(sheetPath).metadata();

  const frames = {};
  for (const index of frameIndices) {
    if (index < 0 || index >= FRAME_COUNT) {
      throw new Error(`${variant.id}: frame index ${index} out of range 0-${FRAME_COUNT - 1}`);
    }
    const rect = frameIndexToSourceRect(index, 0);
    frames[String(index)] = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  }

  const clips = {};
  for (const [name, clip] of Object.entries(manifest)) {
    clips[name] = { frames: [...clip.frames], fps: clip.fps, loop: clip.loop };
  }

  const atlasJson = {
    meta: {
      spriteSize: SPRITE,
      displayScale: 2,
      variant: variant.id,
      sheetWidth: meta.width,
      sheetHeight: meta.height,
      cols: COLS,
      cell: CELL,
      offset: OFFSET,
      mode: 'source-sheet',
    },
    frames,
    clips,
  };

  const outSheet = path.join(OUT, variant.outSheet);
  fs.copyFileSync(sheetPath, outSheet);

  const baseName = variant.id === 'cat1' ? 'cat1-atlas' : `${variant.id}-atlas`;
  fs.writeFileSync(path.join(OUT, `${baseName}.json`), JSON.stringify(atlasJson, null, 2));
  if (variant.id === 'cat1') {
    fs.writeFileSync(
      path.join(OUT, 'cat1-atlas-data.js'),
      `module.exports = ${JSON.stringify(atlasJson)};\n`
    );
  }

  return {
    variant: variant.id,
    frames: frameIndices.length,
    clips: Object.keys(clips).length,
    sheetBytes: fs.statSync(outSheet).size,
    sheetSize: `${meta.width}x${meta.height}`,
  };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const frameIndices = collectFrameIndices(manifest);
  fs.mkdirSync(OUT, { recursive: true });

  await verifyLabeledAlignment(VARIANTS[0]);

  const summaries = [];
  for (const variant of VARIANTS) {
    summaries.push(await buildVariant(variant, manifest, frameIndices));
  }

  for (const s of summaries) {
    console.log(
      `${s.variant}: ${s.frames} frame refs, ${s.clips} clips, sheet ${s.sheetSize}, ${(s.sheetBytes / 1024).toFixed(1)} KB`
    );
  }
  console.log(`Wrote source sheets + atlas JSON to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
