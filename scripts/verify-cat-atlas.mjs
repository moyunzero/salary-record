/**
 * Verify cat atlas JSON + PNG for all three variants.
 * Run: node scripts/verify-cat-atlas.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../miniprogram/assets/cat-pet');
const MAX_PNG_BYTES = 500 * 1024;

const VARIANTS = ['cat1', 'cat1.6', 'cat1.9'];

function baseName(id) {
  return id === 'cat1' ? 'cat1-atlas' : `${id}-atlas`;
}

function verifyVariant(id) {
  const jsonPath = path.join(OUT, `${baseName(id)}.json`);
  const pngPath = path.join(OUT, `${baseName(id)}.png`);

  if (!fs.existsSync(jsonPath) || !fs.existsSync(pngPath)) {
    throw new Error(`${id}: missing atlas files`);
  }

  const atlas = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const pngBytes = fs.statSync(pngPath).size;

  if (pngBytes >= MAX_PNG_BYTES) {
    throw new Error(`${id}: atlas PNG ${pngBytes} bytes exceeds ${MAX_PNG_BYTES} limit`);
  }

  if (atlas.meta?.spriteSize !== 16 || atlas.meta?.displayScale !== 4) {
    throw new Error(`${id}: invalid meta.spriteSize or displayScale`);
  }

  if (atlas.meta?.variant !== id) {
    throw new Error(`${id}: meta.variant is ${atlas.meta?.variant}`);
  }

  let clipCount = 0;
  let frameChecks = 0;

  for (const [clipName, clip] of Object.entries(atlas.clips || {})) {
    clipCount++;
    for (const idx of clip.frames) {
      const key = String(idx);
      const rect = atlas.frames?.[key];
      if (!rect) {
        throw new Error(`${id}: clip ${clipName} missing frame ${idx} in frames map`);
      }
      if (rect.w !== 16 || rect.h !== 16) {
        throw new Error(`${id}: frame ${idx} size ${rect.w}x${rect.h}, expected 16x16`);
      }
      frameChecks++;
    }
  }

  return { id, clipCount, frameChecks, pngBytes };
}

function main() {
  const results = VARIANTS.map(verifyVariant);
  for (const r of results) {
    console.log(
      `${r.id}: ok — ${r.clipCount} clips, ${r.frameChecks} frame refs, ${(r.pngBytes / 1024).toFixed(1)} KB`
    );
  }
  console.log(`verify-cat-atlas.mjs: all ${results.length} variants passed`);
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
