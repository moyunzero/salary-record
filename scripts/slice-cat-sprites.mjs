/**
 * Slice cat sprite sheets into runtime atlas PNG + JSON (v1 down/right clips).
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
const SPRITE = 16;
const OFFSET = 8;
const FRAME_COUNT = 583;

const VARIANTS = [
  { id: 'cat1', source: 'cat-pet/cat 1.png' },
  { id: 'cat1.6', source: 'cat-pet/cat 1.6.png' },
  { id: 'cat1.9', source: 'cat-pet/cat 1.9.png' },
];

function frameIndexToRect(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    left: col * CELL + OFFSET,
    top: row * CELL + OFFSET,
    width: SPRITE,
    height: SPRITE,
  };
}

function collectFrameIndices(manifest) {
  const set = new Set();
  for (const clip of Object.values(manifest)) {
    for (const idx of clip.frames) set.add(idx);
  }
  return [...set].sort((a, b) => a - b);
}

async function buildVariant(variant, manifest, frameIndices) {
  const sourcePath = path.join(ROOT, variant.source);
  const atlasCols = Math.ceil(Math.sqrt(frameIndices.length));
  const atlasRows = Math.ceil(frameIndices.length / atlasCols);
  const atlasWidth = atlasCols * SPRITE;
  const atlasHeight = atlasRows * SPRITE;

  const composites = [];
  const frames = {};

  for (let i = 0; i < frameIndices.length; i++) {
    const index = frameIndices[i];
    if (index < 0 || index >= FRAME_COUNT) {
      throw new Error(`${variant.id}: frame index ${index} out of range 0-${FRAME_COUNT - 1}`);
    }
    const rect = frameIndexToRect(index);
    const buf = await sharp(sourcePath).extract(rect).png().toBuffer();
    const col = i % atlasCols;
    const row = Math.floor(i / atlasCols);
    const x = col * SPRITE;
    const y = row * SPRITE;
    composites.push({ input: buf, left: x, top: y });
    frames[String(index)] = { x, y, w: SPRITE, h: SPRITE };
  }

  const atlasPng = await sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const baseName = variant.id === 'cat1' ? 'cat1-atlas' : `${variant.id}-atlas`;
  const clips = {};
  for (const [name, clip] of Object.entries(manifest)) {
    clips[name] = { frames: [...clip.frames], fps: clip.fps, loop: clip.loop };
  }

  const atlasJson = {
    meta: { spriteSize: SPRITE, displayScale: 4, variant: variant.id },
    frames,
    clips,
  };

  fs.writeFileSync(path.join(OUT, `${baseName}.png`), atlasPng);
  fs.writeFileSync(path.join(OUT, `${baseName}.json`), JSON.stringify(atlasJson, null, 2));

  return {
    variant: variant.id,
    frames: frameIndices.length,
    clips: Object.keys(clips).length,
    pngBytes: atlasPng.length,
    atlasSize: `${atlasWidth}x${atlasHeight}`,
  };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const frameIndices = collectFrameIndices(manifest);
  fs.mkdirSync(OUT, { recursive: true });

  const summaries = [];
  for (const variant of VARIANTS) {
    summaries.push(await buildVariant(variant, manifest, frameIndices));
  }

  for (const s of summaries) {
    console.log(
      `${s.variant}: ${s.frames} frames, ${s.clips} clips, ${s.atlasSize}, ${(s.pngBytes / 1024).toFixed(1)} KB`
    );
  }
  console.log(`Wrote ${summaries.length} atlas pairs to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
