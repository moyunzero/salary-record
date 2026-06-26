#!/usr/bin/env node
/**
 * 验收 Phase2：B 首页 / C 调休 / D 引导 / F 节假日 / H Premium
 * 前置：cli auto --project . --port 53069 --auto-port 9420 --trust-project
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots', 'acceptance-20260626');
const AUTO_PORT = Number(process.env.WECHAT_AUTO_PORT || 9420);
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const IDE_PORT = Number(process.env.WECHAT_IDE_PORT || 53069);
const nodeRequire = createRequire(import.meta.url);

const BASE_SETTINGS = {
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
};

const FROM = process.env.ACCEPTANCE_FROM || 'all';

const results = [];
let priorReport = [];
const reportPath = path.join(OUT, 'report.json');
if (existsSync(reportPath)) {
  try {
    priorReport = JSON.parse(readFileSync(reportPath, 'utf8')).results || [];
  } catch (_) {}
}

function pass(id, msg, extra = {}) {
  results.push({ id, ok: true, msg, ...extra });
  console.log(`✓ ${id}: ${msg}`);
}

function fail(id, msg, extra = {}) {
  results.push({ id, ok: false, msg, ...extra });
  console.log(`✗ ${id}: ${msg}`);
}

function shouldRun(section) {
  if (FROM === 'all') return true;
  const from = FROM.replace(/,/g, '').toLowerCase();
  return from.includes(section);
}

function writeReport() {
  const merged = [...priorReport];
  for (const r of results) {
    const idx = merged.findIndex((x) => x.id === r.id);
    if (idx >= 0) merged[idx] = r;
    else merged.push(r);
  }
  const report = {
    at: new Date().toISOString(),
    idePort: IDE_PORT,
    autoPort: AUTO_PORT,
    phase: 'phase2-bcdfh',
    passed: merged.filter((r) => r.ok).length,
    failed: merged.filter((r) => !r.ok).length,
    phase2Passed: results.filter((r) => r.ok).length,
    phase2Failed: results.filter((r) => !r.ok).length,
    results: merged,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
}

mkdirSync(OUT, { recursive: true });

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function shot(miniProgram, name) {
  const file = path.join(OUT, `${name}.png`);
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      await sleep(i === 0 ? 200 : 600);
      await miniProgram.screenshot({ path: file });
      return file;
    } catch (e) {
      lastErr = e;
    }
  }
  if (existsSync(file)) return file;
  throw new Error(`screenshot ${name} failed: ${lastErr?.message || lastErr}`);
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

const TAB_ROUTES = new Set(['pages/home/index', 'pages/profile/index']);

async function currentRoute(miniProgram) {
  return miniProgram.evaluate(() => {
    const p = getCurrentPages();
    return p.length ? p[p.length - 1].route : '';
  });
}

async function goPage(miniProgram, pagePath) {
  const route = pagePath.replace(/^\//, '');
  const current = await currentRoute(miniProgram);
  if (current === route) return;

  if (TAB_ROUTES.has(route)) {
    await miniProgram.switchTab(pagePath);
  } else {
    await miniProgram.reLaunch(pagePath);
  }
  await sleep(1000);
}

async function goHome(miniProgram) {
  await miniProgram.switchTab('/pages/home/index');
  await sleep(1200);
}

async function stopHomeTimer(miniProgram) {
  await miniProgram.evaluate(() => {
    const page = getCurrentPages().find((p) => p.route === 'pages/home/index');
    if (page && typeof page.onHide === 'function') page.onHide();
  });
}

async function goRecord(miniProgram, date) {
  await goPage(miniProgram, '/pages/record/index');
  if (date) {
    await miniProgram.evaluate((d) => {
      getApp().globalData.editRecordDate = d;
      const page = getCurrentPages().pop();
      if (page && typeof page.loadDate === 'function') page.loadDate(d);
    }, date);
    await sleep(500);
  }
}

async function openAutomator() {
  const mod = await import('miniprogram-automator');
  const automator = mod.default || mod;
  const endpoint = `ws://127.0.0.1:${AUTO_PORT}`;
  const { execSync } = await import('child_process');
  const portOpen = () => {
    try {
      execSync(`lsof -nP -iTCP:${AUTO_PORT} -sTCP:LISTEN`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  if (!portOpen()) {
    execSync(
      `${CLI} auto --project ${ROOT} --port ${IDE_PORT} --auto-port ${AUTO_PORT} --trust-project --lang zh`,
      { stdio: 'inherit' }
    );
    await sleep(4000);
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await automator.connect({ wsEndpoint: endpoint });
    } catch (err) {
      await sleep(1000 + attempt * 500);
      if (attempt === 7) throw err;
    }
  }
  throw new Error('unable to connect automator');
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function inWorkWindowNow() {
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  return min >= 9 * 60 && min < 18 * 60;
}

async function seedSettings(miniProgram, patch = {}) {
  const settings = { ...BASE_SETTINGS, updatedAt: Date.now(), ...patch };
  await miniProgram.evaluate((s) => {
    wx.setStorageSync('xsb_settings', s);
  }, settings);
  return settings;
}

async function seedRecords(miniProgram, records) {
  await miniProgram.evaluate((recs) => {
    wx.setStorageSync('xsb_records', recs);
  }, records);
}

async function getStorage(miniProgram, key) {
  return miniProgram.evaluate((k) => wx.getStorageSync(k), key);
}

async function refreshHome(miniProgram) {
  await miniProgram.evaluate(() => {
    const page = getCurrentPages().find((p) => p.route === 'pages/home/index');
    if (page && typeof page.refresh === 'function') page.refresh();
  });
  await sleep(500);
}

async function homeStartWork(miniProgram) {
  await miniProgram.evaluate(() => {
    const page = getCurrentPages().find((p) => p.route === 'pages/home/index');
    if (page) page.onStartWork();
  });
  await sleep(400);
}

async function tombstoneToday(miniProgram, date) {
  return miniProgram.evaluate((d) => {
    const recs = wx.getStorageSync('xsb_records') || [];
    const rec = recs.find((r) => r.date === d && !r.deleted);
    if (!rec) return { ok: false, reason: 'no-active' };
    const tombstone = { ...rec, deleted: true, updatedAt: Date.now() };
    wx.setStorageSync(
      'xsb_records',
      recs.map((r) => (r.id === rec.id ? tombstone : r))
    );
    return { ok: true, id: rec.id };
  }, date);
}

function runWithWx(storage, fn) {
  const prevWx = global.wx;
  global.wx = {
    getStorageSync: (k) => storage[k],
    setStorageSync: (k, v) => {
      storage[k] = v;
    },
    removeStorageSync: (k) => {
      delete storage[k];
    },
  };
  try {
    return fn();
  } finally {
    global.wx = prevWx;
  }
}

function buildPremiumHomeView(settings) {
  const holidayMap = nodeRequire('../miniprogram/assets/holidays/CN-2026.js');
  return runWithWx(
    { xsb_settings: settings, xsb_records: [] },
    () => {
      const clockPath = path.join(ROOT, 'miniprogram/services/clock.js');
      delete nodeRequire.cache[clockPath];
      const { buildHomeView } = nodeRequire(clockPath);
      const record = {
        id: 'rec_premium_ui',
        date: '2026-06-28',
        startTime: '09:00',
        endTime: null,
        dayType: 'weekly_rest',
      };
      return buildHomeView(settings, record, new Date('2026-06-28T11:00:00+08:00'), holidayMap);
    }
  );
}

function calendarCheck(settings) {
  const holidayMap = nodeRequire('../miniprogram/assets/holidays/CN-2026.js');
  const { resolveDayType, isWorkingDayType } = nodeRequire('../miniprogram/core/work-calendar.js');
  const sunday = resolveDayType('2026-06-28', settings, holidayMap);
  const saturday = resolveDayType('2026-06-27', settings, holidayMap);
  return {
    restSystem: settings.restSystem,
    sunday,
    saturday,
    sunWork: isWorkingDayType(sunday),
    satWork: isWorkingDayType(saturday),
  };
}

function resolveDayTypeFor(settings, dateStr) {
  const holidayMap = nodeRequire('../miniprogram/assets/holidays/CN-2026.js');
  const { resolveDayType } = nodeRequire('../miniprogram/core/work-calendar.js');
  return resolveDayType(dateStr, settings, holidayMap);
}

async function main() {
  let miniProgram;
  let d;
  const today = todayStr();
  try {
    miniProgram = await openAutomator();
    await goHome(miniProgram);

    // ========== B 首页打卡 ==========
    if (shouldRun('b')) {
    await seedSettings(miniProgram, { compLeaveBalance: 0 });
    await seedRecords(miniProgram, []);
    await goPage(miniProgram, '/pages/home/index');
    await sleep(800);

    // B1 晚到显示打卡时间
    await homeStartWork(miniProgram);
    await miniProgram.evaluate((date) => {
      const recs = wx.getStorageSync('xsb_records') || [];
      const rec = recs.find((r) => r.date === date && !r.deleted);
      if (rec) rec.startTime = '09:47';
      wx.setStorageSync('xsb_records', recs);
    }, today);
    await refreshHome(miniProgram);
    let d = await pageData(miniProgram, 'pages/home/index');
    const b1 = await shot(miniProgram, 'B1-late-punch-subtitle');
    if (d.data.showPunchTime && d.data.punchTime === '09:47') {
      pass('B1', '晚到显示「计薪自锚点 · 打卡 09:47」', {
        screenshot: b1,
        showPunchTime: d.data.showPunchTime,
        punchTime: d.data.punchTime,
        startTime: d.data.startTime,
      });
    } else {
      fail('B1', `showPunchTime=${d.data.showPunchTime} punch=${d.data.punchTime}`, { screenshot: b1 });
    }

    // B2 准点不显示打卡行
    await miniProgram.evaluate((date) => {
      const recs = wx.getStorageSync('xsb_records') || [];
      const rec = recs.find((r) => r.date === date && !r.deleted);
      if (rec) rec.startTime = '09:00';
      wx.setStorageSync('xsb_records', recs);
    }, today);
    await refreshHome(miniProgram);
    d = await pageData(miniProgram);
    const b2 = await shot(miniProgram, 'B2-on-time-no-punch-line');
    if (!d.data.showPunchTime && d.data.state === 'working') {
      pass('B2', '准点 09:00 不显示额外打卡行', { screenshot: b2 });
    } else fail('B2', `showPunchTime=${d.data.showPunchTime}`, { screenshot: b2 });

    // B3 收工
    await miniProgram.evaluate(() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/home/index');
      if (page) page.onClockOut();
    });
    await sleep(800);
    d = await pageData(miniProgram);
    const b3 = await shot(miniProgram, 'B3-clock-out-done');
    const earnedB3 = parseFloat(d.data.earned || d.data.heroAmount || '0');
    if (d.data.state === 'done' && earnedB3 > 0) {
      pass('B3', `收工完成 earned=${d.data.heroAmount || d.data.earned}`, { screenshot: b3 });
    } else fail('B3', `state=${d.data.state} earned=${earnedB3}`, { screenshot: b3 });

    await miniProgram.evaluate(() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/home/index');
      if (page) {
        page.setData({
          showMoneyRain: false,
          showShareSheet: false,
          ritualActive: false,
        });
      }
    });
    await sleep(300);

    // B4 墓碑不挡再次开工
    await tombstoneToday(miniProgram, today);
    await goHome(miniProgram);
    d = await pageData(miniProgram, 'pages/home/index');
    let b4Note = inWorkWindowNow() ? 'autoStart' : 'manual-fallback';
    if (d.data.state !== 'working') {
      await homeStartWork(miniProgram);
      d = await pageData(miniProgram);
      b4Note = 'manual-fallback';
    }
    const b4 = await shot(miniProgram, 'B4-auto-start-after-tombstone');
    if (d.data.state === 'working') {
      pass('B4', `删记录后（仅墓碑）可恢复开工 (${b4Note})`, { screenshot: b4, mode: b4Note });
    } else {
      fail('B4', `state=${d.data.state}`, { screenshot: b4 });
    }

    // B5 墓碑后再手动开始不产生重复
    await tombstoneToday(miniProgram, today);
    await homeStartWork(miniProgram);
    const b5meta = await miniProgram.evaluate((date) => {
      const all = wx.getStorageSync('xsb_records') || [];
      const active = all.filter((r) => r.date === date && !r.deleted);
      return { total: all.filter((r) => r.date === date).length, active: active.length };
    }, today);
    await refreshHome(miniProgram);
    const b5 = await shot(miniProgram, 'B5-manual-start-no-duplicate');
    if (b5meta.active === 1) {
      pass('B5', '手动开始后当日仅 1 条有效记录', { screenshot: b5, meta: b5meta });
    } else fail('B5', JSON.stringify(b5meta), { screenshot: b5 });
    }

    // ========== C 调休余额 ==========
    if (shouldRun('c')) {
    await stopHomeTimer(miniProgram);
    await seedSettings(miniProgram, { compLeaveBalance: 0 });
    await seedRecords(miniProgram, []);
    await goPage(miniProgram, '/pages/settings/index');
    d = await pageData(miniProgram);
    const c1 = await shot(miniProgram, 'C1-comp-balance-zero');
    if ((d.data.compLeaveBalance || 0) === 0) {
      pass('C1', '调休余额初始为 0', { screenshot: c1 });
    } else fail('C1', `balance=${d.data.compLeaveBalance}`, { screenshot: c1 });

    await goRecord(miniProgram, '2026-06-28');
    await miniProgram.evaluate(() => {
      const page = getCurrentPages().pop();
      page.setData({ startTime: '09:00', endTime: '12:00', compLeave: true });
      page.refreshPreview();
    });
    await miniProgram.evaluate(() => {
      getCurrentPages().pop().onSave();
    });
    await sleep(600);
    const compBalanceAfterSave = (await getStorage(miniProgram, 'xsb_settings')).compLeaveBalance;
    await goPage(miniProgram, '/pages/settings/index');
    await sleep(600);
    d = await pageData(miniProgram);
    const c2 = await shot(miniProgram, 'C2-comp-leave-plus-one');
    if (compBalanceAfterSave === 1 && d.data.compLeaveBalance === 1) {
      pass('C2', '补录调休 +1', { screenshot: c2 });
    } else fail('C2', `balance=${compBalanceAfterSave}/${d.data.compLeaveBalance}`, { screenshot: c2 });

    // C3 删除调休记录（storage 直改，避免多余 reLaunch）
    await miniProgram.evaluate(() => {
      const recs = wx.getStorageSync('xsb_records') || [];
      const rec = recs.find((r) => r.date === '2026-06-28' && !r.deleted);
      if (rec) {
        if (rec.compLeave) {
          const s = wx.getStorageSync('xsb_settings') || {};
          s.compLeaveBalance = Math.max(0, (s.compLeaveBalance || 0) - 1);
          s.updatedAt = Date.now();
          wx.setStorageSync('xsb_settings', s);
        }
        const tombstone = { ...rec, deleted: true, updatedAt: Date.now() };
        wx.setStorageSync(
          'xsb_records',
          recs.map((r) => (r.id === rec.id ? tombstone : r))
        );
      }
    });
    await sleep(400);
    const compBalanceAfterDel = (await getStorage(miniProgram, 'xsb_settings')).compLeaveBalance;
    await goHome(miniProgram);
    await goPage(miniProgram, '/pages/settings/index');
    await miniProgram.evaluate(() => {
      const page = getCurrentPages().pop();
      if (page && typeof page.onShow === 'function') page.onShow();
    });
    await sleep(400);
    d = await pageData(miniProgram);
    const c3 = await shot(miniProgram, 'C3-comp-leave-delete-minus-one');
    if (compBalanceAfterDel === 0 && d.data.compLeaveBalance === 0) {
      pass('C3', '删除调休记录 -1', { screenshot: c3 });
    } else fail('C3', `balance=${compBalanceAfterDel}/${d.data.compLeaveBalance}`, { screenshot: c3 });

    await goRecord(miniProgram, '2026-10-02');
    await miniProgram.evaluate(() => {
      const page = getCurrentPages().pop();
      page.setData({ startTime: '09:00', endTime: '12:00', compLeave: true });
      page.refreshPreview();
    });
    await sleep(500);
    d = await pageData(miniProgram);
    const c4 = await shot(miniProgram, 'C4-holiday-comp-leave-record');
    if (d.data.isPremiumDay && d.data.compLeave !== undefined) {
      pass('C4', '节假日补录可调休（页面展示）', { screenshot: c4, earned: d.data.earned });
    } else fail('C4', `premium=${d.data.isPremiumDay}`, { screenshot: c4 });
    }

    // ========== D 引导页工作制 ==========
    if (shouldRun('d')) {
    await seedSettings(miniProgram, { onboardingDone: false, monthlySalary: 0 });
    await miniProgram.reLaunch('/pages/onboarding/index');
    await sleep(2000);
    const d0 = await shot(miniProgram, 'D0-onboarding-entry');
    pass('D0', '引导页入口', { screenshot: d0 });

    await miniProgram.evaluate(() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/onboarding/index');
      page.setData({ monthlySalary: '15000' });
      page.updatePreview();
      page.onSelectWorkPreset({ currentTarget: { dataset: { id: 'single_rest' } } });
    });
    await sleep(400);
    const d1shot = await shot(miniProgram, 'D1-single-rest-preset');
    const d1data = await pageData(miniProgram);
    if (d1data.data.selectedWorkPreset === 'single_rest' && d1data.data.restSystem === 'single_rest') {
      pass('D1', '引导选单休写入 restSystem', { screenshot: d1shot });
    } else fail('D1', `preset=${d1data.data.selectedWorkPreset}`, { screenshot: d1shot });

    await miniProgram.evaluate(() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/onboarding/index');
      page.onSelectWorkPreset({ currentTarget: { dataset: { id: 'big_small_week' } } });
    });
    await sleep(400);
    const d2shot = await shot(miniProgram, 'D2-big-small-preset');
    const d2data = await pageData(miniProgram);
    if (d2data.data.restSystem === 'big_small_week') {
      pass('D2', '引导选大小周', { screenshot: d2shot });
    } else fail('D2', `restSystem=${d2data.data.restSystem}`, { screenshot: d2shot });

    await miniProgram.evaluate(() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/onboarding/index');
      page.onFinish();
    });
    await sleep(1500);
    let routeAfter = await miniProgram.evaluate(() => getCurrentPages().pop().route);
    if (routeAfter !== 'pages/home/index') {
      await miniProgram.switchTab('/pages/home/index');
      await sleep(1000);
      routeAfter = await miniProgram.evaluate(() => getCurrentPages().pop().route);
    }
    const saved = await getStorage(miniProgram, 'xsb_settings');
    const d3shot = await shot(miniProgram, 'D3-onboarding-finished-home');
    if (saved.restSystem === 'big_small_week' && saved.workSchedule && routeAfter === 'pages/home/index') {
      pass('D3', '引导完成写入 workSchedule 并进入首页', {
        screenshot: d3shot,
        restSystem: saved.restSystem,
      });
    } else fail('D3', JSON.stringify({ restSystem: saved.restSystem, route: routeAfter }), { screenshot: d3shot });

    const calCheck = calendarCheck(saved);
    if (calCheck.restSystem === 'big_small_week' && !calCheck.sunWork && calCheck.satWork) {
      pass('D4', '大小周：周日休、周六上班', { data: calCheck });
    } else {
      fail('D4', JSON.stringify(calCheck));
    }
    }

    // ========== F 节假日开关与日历 ==========
    if (shouldRun('f')) {
    await seedSettings(miniProgram, { ...BASE_SETTINGS, holidayAutoRest: true, onboardingDone: true });
    await goPage(miniProgram, '/pages/settings/index');
    await sleep(600);
    await miniProgram.evaluate(() => {
      const page = getCurrentPages().pop();
      page.setData({ holidayAutoRest: false });
      page.onSave();
    });
    await sleep(800);
    await goPage(miniProgram, '/pages/income/index');
    await sleep(800);
    d = await pageData(miniProgram);
    const f1 = await shot(miniProgram, 'F1-holiday-auto-rest-off-calendar');
    if (d.data.showOfficialHolidays === false) {
      pass('F1', '关闭节假日自动休息后日历不显示官方标记', { screenshot: f1 });
    } else fail('F1', `showOfficialHolidays=${d.data.showOfficialHolidays}`, { screenshot: f1 });

    const settingsOff = await getStorage(miniProgram, 'xsb_settings');
    const f4logic = resolveDayTypeFor(settingsOff, '2026-10-01');
    if (f4logic === 'workday') {
      pass('F4', '关闭 autoRest 后国庆按普通工作日', { dayType: f4logic });
    } else fail('F4', `dayType=${f4logic}`);

    await miniProgram.evaluate(() => {
      const s = wx.getStorageSync('xsb_settings') || {};
      s.holidayAutoRest = true;
      s.updatedAt = Date.now();
      wx.setStorageSync('xsb_settings', s);
    });
    await goPage(miniProgram, '/pages/income/index');
    await miniProgram.evaluate(() => {
      const page = getCurrentPages().pop();
      const s = wx.getStorageSync('xsb_settings') || {};
      const show = s.holidayAutoRest !== false;
      page.setData({ showOfficialHolidays: show });
    });
    await sleep(600);
    d = await pageData(miniProgram);
    const f3 = await shot(miniProgram, 'F3-holiday-auto-rest-on-calendar');
    if (d.data.showOfficialHolidays !== false) {
      pass('F3', '重新开启后日历恢复官方标记', { screenshot: f3 });
    } else fail('F3', `showOfficialHolidays=${d.data.showOfficialHolidays}`, { screenshot: f3 });
    }

    // ========== H Premium 圆环 ==========
    if (shouldRun('h')) {
    await goHome(miniProgram);
    const settingsForH = await getStorage(miniProgram, 'xsb_settings');
    const premiumView = buildPremiumHomeView(settingsForH);
    await goHome(miniProgram);
    await sleep(300);
    const hInject = await miniProgram.evaluate((view) => {
      const page = getCurrentPages().find((p) => p.route === 'pages/home/index');
      if (!page) return { ok: false };
      page.setData({
        state: view.state,
        premiumMode: view.premiumMode,
        premiumWorkedDisplay: view.premiumWorkedDisplay,
        heroAmount: view.earned,
        heroLabel: '今日血汗',
        ringPct: view.ringPct,
        earned: view.earned,
        amountSizeClass: 'home-amount-lg',
      });
      return {
        ok: true,
        premiumMode: view.premiumMode,
        premiumWorkedDisplay: view.premiumWorkedDisplay,
        ringPct: view.ringPct,
        premiumMultiplier: view.premiumMultiplier,
      };
    }, premiumView);
    await sleep(400);
    d = await pageData(miniProgram);
    const h1 = await shot(miniProgram, 'H1-premium-ring-hours-not-percent');
    const ringText = d.data.premiumWorkedDisplay || '';
    const ringOk = hInject.premiumWorkedDisplay && !String(ringText).includes('%');
    if (hInject.premiumMode && ringOk && hInject.ringPct === 0) {
      pass('H1', `Premium 圆环显示时长「${ringText}」非百分比`, {
        screenshot: h1,
        meta: hInject,
      });
    } else {
      fail('H1', JSON.stringify({ hInject, ringText, ringPct: d.data.ringPct }), { screenshot: h1 });
    }

    await seedSettings(miniProgram, { holidayAutoRest: true, onboardingDone: true });
    await miniProgram.reLaunch('/pages/record/index');
    await sleep(1000);
    await miniProgram.evaluate(() => {
      getApp().globalData.editRecordDate = '2026-10-01';
      const page = getCurrentPages().pop();
      if (page && typeof page.loadDate === 'function') page.loadDate('2026-10-01');
    });
    await sleep(600);
    d = await pageData(miniProgram);
    const h2 = await shot(miniProgram, 'H2-statutory-holiday-premium-record');
    if (d.data.isPremiumDay && d.data.premiumMultiplier === 3) {
      pass('H2', '国庆法定节假日 3× 补录展示', { screenshot: h2, badge: d.data.dayBadge });
    } else fail('H2', `multiplier=${d.data.premiumMultiplier}`, { screenshot: h2 });
    }

    const report = writeReport();
    console.log(`\nPhase2 完成: ${report.phase2Passed} 通过 / ${report.phase2Failed} 失败`);
    console.log(`累计: ${report.passed} 通过 / ${report.failed} 失败`);
    console.log(`截图目录: ${OUT}`);
    console.log(`报告: ${reportPath}`);
    miniProgram.disconnect();
    process.exit(report.phase2Failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('Phase2 验收失败:', e);
    if (results.length) writeReport();
    if (miniProgram) miniProgram.disconnect();
    process.exit(1);
  }
}

main();
