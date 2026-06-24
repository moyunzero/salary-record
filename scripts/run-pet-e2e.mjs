#!/usr/bin/env node
/**
 * 通过微信开发者工具 Automator 跑 pet E2E。
 *
 * 前置：IDE 已打开项目、模拟器在首页、设置→安全→服务端口已开启（当前 19295）。
 *
 * 用法：
 *   npm run test:pet-e2e
 *   WECHAT_IDE_PORT=19295 WECHAT_AUTO_PORT=9420 npm run test:pet-e2e
 */
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import runPetAutomatorSuite from '../tests/e2e/pet-automator.harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const AUTO_PORT = Number(process.env.WECHAT_AUTO_PORT || 9420);
const IDE_PORT = Number(process.env.WECHAT_IDE_PORT || 19295);
const PROJECT = ROOT;

async function openAutomator() {
  const mod = await import('miniprogram-automator');
  const automator = mod.default || mod;

  try {
    const miniProgram = await automator.connect({
      wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}`,
    });
    console.log(`Connected ws://${AUTO_PORT}`);
    return miniProgram;
  } catch {
    console.log(`Launch automator (IDE ${IDE_PORT}, auto ${AUTO_PORT})…`);
    return automator.launch({
      cliPath: CLI,
      projectPath: PROJECT,
      port: AUTO_PORT,
      trustProject: true,
      timeout: 90000,
    });
  }
}

async function main() {
  console.log('Running pet E2E suite in simulator (~35s)…');
  let miniProgram;
  try {
    miniProgram = await openAutomator();
    const page = await miniProgram.currentPage();
    console.log(`Page: ${page.path}`);
    const parsed = await miniProgram.evaluate(runPetAutomatorSuite);

    const outDir = path.join(ROOT, 'tests/e2e/output');
    mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `pet-e2e-${Date.now()}.json`);
    writeFileSync(outFile, JSON.stringify(parsed, null, 2));

    console.log(`\nPet E2E: ${parsed.passed}/${parsed.total} passed, ${parsed.failed} failed`);
    console.log(`Report: ${outFile}\n`);

    for (const r of parsed.results || []) {
      const mark = r.ok ? '✓' : '✗';
      console.log(`${mark} ${r.id}: ${r.msg}`);
    }

    await miniProgram.close();
    process.exit(parsed.failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('E2E failed:', e.message || e);
    if (miniProgram) await miniProgram.close().catch(() => {});
    process.exit(1);
  }
}

main();
