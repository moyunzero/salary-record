#!/usr/bin/env node
/**
 * 薪时宝人工验收方案 — 自动化执行 + 截图留存
 * 前置：IDE 服务端口已开启，且已执行：
 *   cli auto --project . --port <IDE_PORT> --auto-port 9420 --trust-project
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots', 'acceptance-20260626');
const AUTO_PORT = Number(process.env.WECHAT_AUTO_PORT || 9420);
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const IDE_PORT = Number(process.env.WECHAT_IDE_PORT || 53069);

const SETTINGS = {
  monthlySalary: 15000,
  workDaysPerMonth: 21.75,
  standardHoursPerDay: 8,
  insurance: { pension: 0.08, medical: 0.02, unemployment: 0.005, fund: 0.12 },
  workStartTime: '09:00',
  workSchedule: {
    morning: { start: '09:00', end: '12:00' },
    lunch: { start: '12:00', end: '13:00' },
    afternoon: { start: '13:00', end: '18:00' },
    eveningRest: { start: '18:00', end: '19:00' },
    nightWork: { start: '19:00', end: '22:00' },
  },
  nightShiftEnabled: false,
  autoStartEnabled: true,
  restSystem: 'double_rest',
  bigSmall: { anchorWeekDate: '', anchorType: 'big' },
  holidayAutoRest: true,
  compLeaveBalance: 0,
  cloudSyncEnabled: false,
  onboardingDone: true,
  updatedAt: Date.now(),
};

mkdirSync(OUT, { recursive: true });

const results = [];

function pass(id, msg, extra = {}) {
  results.push({ id, ok: true, msg, ...extra });
  console.log(`✓ ${id}: ${msg}`);
}

function fail(id, msg, extra = {}) {
  results.push({ id, ok: false, msg, ...extra });
  console.log(`✗ ${id}: ${msg}`);
}

async function shot(miniProgram, name) {
  const file = path.join(OUT, `${name}.png`);
  await miniProgram.screenshot({ path: file });
  return file;
}

async function pageData(miniProgram, expectedPath) {
  const data = await miniProgram.evaluate(() => {
    const pages = getCurrentPages();
    const p = pages[pages.length - 1];
    return p ? { route: p.route, data: p.data } : null;
  });
  if (expectedPath && data?.route !== expectedPath) {
    throw new Error(`expected ${expectedPath}, got ${data?.route}`);
  }
  return data;
}

async function seedStorage(miniProgram) {
  await miniProgram.evaluate((settings) => {
    wx.setStorageSync('xsb_settings', settings);
    wx.setStorageSync('xsb_records', []);
  }, SETTINGS);
}

async function openAutomator() {
  const mod = await import('miniprogram-automator');
  const automator = mod.default || mod;
  try {
    return await automator.connect({ wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}` });
  } catch {
    const { execSync } = await import('child_process');
    execSync(
      `${CLI} auto --project ${ROOT} --port ${IDE_PORT} --auto-port ${AUTO_PORT} --trust-project --lang zh`,
      { stdio: 'inherit' }
    );
    return automator.connect({ wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}` });
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function currentRoute(miniProgram) {
  return miniProgram.evaluate(() => {
    const p = getCurrentPages();
    return p.length ? p[p.length - 1].route : '';
  });
}

async function goPage(miniProgram, pagePath) {
  const route = pagePath.replace(/^\//, '');
  const current = await currentRoute(miniProgram);
  if (current !== route) {
    await miniProgram.reLaunch(pagePath);
    await sleep(1000);
  }
}

async function goRecord(miniProgram, date) {
  await goPage(miniProgram, '/pages/record/index');
  if (date) {
    await miniProgram.evaluate((d) => {
      getApp().globalData.editRecordDate = d;
      const page = getCurrentPages().pop();
      if (page && typeof page.loadDate === 'function') page.loadDate(d);
    }, date);
    await sleep(400);
  }
}

async function setRecordTimes(miniProgram, times) {
  await miniProgram.evaluate((t) => {
    const page = getCurrentPages()[getCurrentPages().length - 1];
    page.setData({
      startTime: t.startTime,
      endTime: t.endTime,
      date: t.date || page.data.date,
    });
    if (typeof page.refreshPreview === 'function') page.refreshPreview();
  }, times);
  await sleep(300);
}

async function main() {
  let miniProgram;
  try {
    miniProgram = await openAutomator();
    await miniProgram.reLaunch('/pages/home/index');
    await sleep(1000);
    await seedStorage(miniProgram);
    await miniProgram.reLaunch('/pages/home/index');
    await sleep(1000);

    // PREP
    const prep = await shot(miniProgram, 'PREP-00-home-seeded');
    pass('PREP', '种子数据已写入', { screenshot: prep });

    // === A 搬砖记录 ===
    await goRecord(miniProgram);
    const workday = '2026-06-23';
    await setRecordTimes(miniProgram, { date: workday, startTime: '09:00', endTime: '18:00' });
    let d = await pageData(miniProgram, 'pages/record/index');
    const a1 = await shot(miniProgram, 'A1-09-18-no-overtime');
    if (!d.data.inOvertime && d.data.dilutionDisplay === 0) {
      pass('A1', '09:00-18:00 无白加、贬值 0%', { screenshot: a1, data: pick(d.data) });
    } else fail('A1', `inOvertime=${d.data.inOvertime} dilution=${d.data.dilutionDisplay}`, { screenshot: a1 });

    await setRecordTimes(miniProgram, { startTime: '09:00', endTime: '19:00' });
    d = await pageData(miniProgram);
    const a2 = await shot(miniProgram, 'A2-09-19-overtime-1h');
    if (d.data.inOvertime && d.data.overtimeDuration === '1h') {
      pass('A2', '09:00-19:00 白加 1h', { screenshot: a2, data: pick(d.data) });
    } else fail('A2', `overtime=${d.data.overtimeDuration} inOT=${d.data.inOvertime}`, { screenshot: a2 });

    await setRecordTimes(miniProgram, { startTime: '08:00', endTime: '18:00' });
    d = await pageData(miniProgram);
    const a3 = await shot(miniProgram, 'A3-08-18-anchor-no-overtime');
    if (!d.data.inOvertime && d.data.showPayAnchorNote) {
      pass('A3', '08:00-18:00 按锚点无白加，有锚点说明', { screenshot: a3, data: pick(d.data) });
    } else fail('A3', `inOT=${d.data.inOvertime} note=${d.data.showPayAnchorNote}`, { screenshot: a3 });

    const previewEarned = d.data.earned;
    await setRecordTimes(miniProgram, { startTime: '10:00', endTime: '18:00' });
    d = await pageData(miniProgram);
    const a4preview = d.data.earned;
    await miniProgram.evaluate(() => {
      const page = getCurrentPages().pop();
      page.onSave();
    });
    await sleep(500);
    d = await pageData(miniProgram);
    const a4 = await shot(miniProgram, 'A4-late-save-match-preview');
    if (a4preview === previewEarned && d.data.earned === previewEarned) {
      pass('A4', '10:00-18:00 预览与保存金额一致', { screenshot: a4, earned: d.data.earned });
    } else fail('A4', `preview=${a4preview} saved=${d.data.earned}`, { screenshot: a4 });

    await miniProgram.evaluate((salary) => {
      const s = wx.getStorageSync('xsb_settings') || {};
      s.monthlySalary = salary;
      s.updatedAt = Date.now() + 1;
      wx.setStorageSync('xsb_settings', s);
    }, 20000);
    await goRecord(miniProgram, workday);
    d = await pageData(miniProgram);
    const a5 = await shot(miniProgram, 'A5-settings-refresh-preview');
    const earnedAfter = parseFloat(d.data.earned);
    if (earnedAfter > parseFloat(previewEarned)) {
      pass('A5', '改月薪后预览已刷新', { screenshot: a5, before: previewEarned, after: d.data.earned });
    } else fail('A5', `earned not increased: ${d.data.earned}`, { screenshot: a5 });

    // === E 收入页 ===
    await goPage(miniProgram, '/pages/income/index');
    d = await pageData(miniProgram, 'pages/income/index');
    const e1 = await shot(miniProgram, 'E1-income-near7d-label');
    pass('E1', '收入页已打开（近7天标签需目视确认截图）', { screenshot: e1 });

    // === G 设置页 ===
    await goPage(miniProgram, '/pages/settings/index');
    d = await pageData(miniProgram, 'pages/settings/index');
    const g1 = await shot(miniProgram, 'G1-settings-loaded');
    if (String(d.data.monthlySalary) === '20000') {
      pass('G1', '设置页 onShow 重载月薪 20000', { screenshot: g1 });
    } else fail('G1', `monthlySalary=${d.data.monthlySalary}`, { screenshot: g1 });

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // === I 导航 ===
    await miniProgram.reLaunch('/pages/profile/index');
    await sleep(600);
    await miniProgram.evaluate((d) => {
      getApp().globalData.editRecordDate = d;
    }, todayStr);
    await goPage(miniProgram, '/pages/record/index');
    d = await pageData(miniProgram, 'pages/record/index');
    const i1 = await shot(miniProgram, 'I1-profile-to-record-today');
    if (d.data.date === todayStr) {
      pass('I1', '从「我」进补录定位今天', { screenshot: i1, date: d.data.date });
    } else fail('I1', `date=${d.data.date} today=${todayStr}`, { screenshot: i1 });

    const report = {
      at: new Date().toISOString(),
      idePort: IDE_PORT,
      autoPort: AUTO_PORT,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
    const reportPath = path.join(OUT, 'report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n验收完成: ${report.passed} 通过 / ${report.failed} 失败`);
    console.log(`截图目录: ${OUT}`);
    console.log(`报告: ${reportPath}`);
    await miniProgram.disconnect();
    process.exit(report.failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('验收脚本失败:', e);
    if (miniProgram) miniProgram.disconnect();
    process.exit(1);
  }
}

function pick(data) {
  return {
    earned: data.earned,
    inOvertime: data.inOvertime,
    overtimeDuration: data.overtimeDuration,
    dilutionDisplay: data.dilutionDisplay,
    showPayAnchorNote: data.showPayAnchorNote,
    payAnchorStart: data.payAnchorStart,
  };
}

main();
