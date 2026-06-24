#!/usr/bin/env node
/**
 * 将项目根 sound/ 下的真实猫叫素材复制到 miniprogram/assets/sound/
 * Run: npm run build:meow-sfx
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'sound');
const OUT_DIR = path.join(ROOT, 'miniprogram/assets/sound');

/** 源文件名 → 运行时 id */
const MAP = {
  meow_soft: 'stu9-cute-cat-352656.mp3',
  meow_mid: 'sound_garage-cat-meow-8-fx-306184.mp3',
  meow_loud: 'tanweraman-angry-cat-hq-sound-effect-240675.mp3',
};

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error('Missing sound/ directory at project root');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const [id, srcName] of Object.entries(MAP)) {
    const src = path.join(SRC_DIR, srcName);
    const dest = path.join(OUT_DIR, `${id}.mp3`);
    if (!fs.existsSync(src)) {
      console.error(`Missing source: sound/${srcName}`);
      process.exit(1);
    }
    fs.copyFileSync(src, dest);
    const kb = (fs.statSync(dest).size / 1024).toFixed(1);
    console.log(`✓ ${id}.mp3 ← ${srcName} (${kb} KB)`);
  }

  const unused = fs.readdirSync(SRC_DIR).filter(
    (f) => f.endsWith('.mp3') && !Object.values(MAP).includes(f)
  );
  if (unused.length) {
    console.log(`\nNote: unused in sound/: ${unused.join(', ')}`);
  }
}

main();
