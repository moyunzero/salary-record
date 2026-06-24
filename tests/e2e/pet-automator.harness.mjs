/**
 * Pet E2E — 在模拟器 AppService 内执行（由 miniprogram-automator evaluate 注入）。
 * 返回 { passed, failed, total, results[] }
 */
export default function runPetAutomatorSuite() {
  return (async () => {
  const SCENARIOS = [
    'beforeWork', 'offDuty', 'onShift', 'lunch', 'dinner', 'nightShift',
    'otL1', 'otL2', 'otL3', 'otL4', 'doneActive', 'doneNight',
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const snap = (cat) => {
    if (!cat) return null;
    const rhythm = cat._microSession && cat._microSession.rhythm;
    return {
      px: cat.data.posX,
      py: cat.data.posY,
      walking: !!cat._isWalking,
      arc: !!cat._arcWalkActive,
      mt: !!(cat._moveTarget),
      loop: !!cat._loopTimer,
      stageH: cat._stageHeight || 0,
      stageW: cat._stageWidth || 0,
      maxY: cat.data.debugMaxY || 0,
      clip: cat._activeClipName || '',
      segment: rhythm ? rhythm.segment : null,
      arousal: rhythm ? rhythm.arousal : null,
      micro: !!(cat.isMicroActive && cat.isMicroActive()),
      excited: !!(cat._microSession && cat._microSession.excitedPatrolUntil > Date.now()),
      interrupt: !!cat._interruptChain,
    };
  };

  const isStuckWalk = (s) =>
    s && s.arc && !s.walking && !s.mt && s.clip.startsWith('walk_');

  const selectScenario = (page, id) => {
    page.onPetDebugSelectScenario({ currentTarget: { dataset: { id } } });
  };

  const results = [];
  const pass = (id, msg, extra) => results.push({ id, ok: true, msg, extra: extra || null });
  const fail = (id, msg, extra) => results.push({ id, ok: false, msg, extra: extra || null });

  const page = getCurrentPages().pop();
  if (!page) {
    fail('T00', 'no page');
    return { passed: 0, failed: 1, total: 1, results };
  }

  let cat = page.selectComponent('#homeCat');
  if (!cat) {
    fail('T00', 'no #homeCat');
    return { passed: 0, failed: 1, total: 1, results };
  }
  pass('T00', 'page + cat ok');

  page.setData({ petDebugOpen: true, petDebugActive: false });
  if (cat.startLoop) cat.startLoop();
  if (page.measurePetDock) page.measurePetDock();
  await sleep(400);

  cat = page.selectComponent('#homeCat');
  const s1 = snap(cat);
  if (s1.stageH > 72 && s1.maxY > 20) pass('T01-stage', `stage ${s1.stageW}x${s1.stageH} maxY=${s1.maxY}`, s1);
  else fail('T01-stage', 'stage/maxY invalid', s1);

  if (s1.loop) pass('T01-loop', 'animation loop active');
  else fail('T01-loop', 'loop not running', s1);

  if (s1.micro) pass('T01-micro', 'micro FSM active');
  else fail('T01-micro', 'micro FSM off', s1);

  for (let i = 0; i < SCENARIOS.length; i += 1) {
    const id = SCENARIOS[i];
    selectScenario(page, id);
    await sleep(700);
    cat = page.selectComponent('#homeCat');
    if (cat && cat.startLoop) cat.startLoop();
    const s = snap(cat);
    const tid = `T02-${id}`;
    if (!s || !s.micro) {
      fail(tid, 'micro inactive after scenario', s);
    } else if (isStuckWalk(s)) {
      fail(tid, 'stuck walk (arc without movement)', s);
    } else {
      pass(tid, `scenario ok · ${s.clip}`, { segment: s.segment, clip: s.clip });
    }
  }

  selectScenario(page, 'onShift');
  await sleep(300);
  cat = page.selectComponent('#homeCat');
  if (cat && cat.resetMicroState) cat.resetMicroState(false);
  await sleep(500);
  cat = page.selectComponent('#homeCat');
  const p0 = snap(cat);
  let moved = false;
  let last = p0;
  for (let i = 0; i < 24; i += 1) {
    await sleep(500);
    last = snap(cat);
    if (
      Math.abs(last.px - p0.px) >= 3 ||
      Math.abs(last.py - p0.py) >= 3
    ) {
      moved = true;
      break;
    }
  }
  if (moved) pass('T03-walk-onShift', `moved (${p0.px},${p0.py})→(${last.px},${last.py})`, { p0, last });
  else fail('T03-walk-onShift', 'no displacement in 12s', { p0, last });

  if (last && !isStuckWalk(last)) pass('T03-no-stuck', 'no stuck walk after roam');
  else fail('T03-no-stuck', 'stuck walk state', last);

  selectScenario(page, 'otL4');
  await sleep(800);
  cat = page.selectComponent('#homeCat');
  if (cat && cat.resetMicroState) cat.resetMicroState(false);
  await sleep(1200);
  cat = page.selectComponent('#homeCat');
  const sL4 = snap(cat);
  const l4ok =
    sL4 &&
    sL4.micro &&
    (!sL4.clip.startsWith('sleep') || sL4.segment === 'REST');
  if (l4ok && !isStuckWalk(sL4)) pass('T04-overtime-L4', `L4 ok · ${sL4.clip}`, sL4);
  else fail('T04-overtime-L4', 'L4 invalid or stuck', sL4);

  selectScenario(page, 'onShift');
  await sleep(400);
  cat = page.selectComponent('#homeCat');
  if (cat && cat.debugInjectExcitedPatrol) cat.debugInjectExcitedPatrol();
  await sleep(600);
  cat = page.selectComponent('#homeCat');
  const sEx = snap(cat);
  if (sEx && sEx.excited) pass('T05-excited-patrol', 'patrol triggered', sEx);
  else fail('T05-excited-patrol', 'patrol not active', sEx);

  await sleep(2000);
  cat = page.selectComponent('#homeCat');
  if (cat && cat.clearTapCooldown) cat.clearTapCooldown();
  if (cat && cat.onArcTap) {
    cat.onArcTap({ detail: { x: 36, y: 36 } });
  }
  await sleep(3200);
  cat = page.selectComponent('#homeCat');
  const sTap = snap(cat);
  const tapOk = sTap && (sTap.interrupt || sTap.clip.indexOf('meow') >= 0 || sTap.clip.indexOf('yawn') >= 0);
  if (tapOk) pass('T06-tap-awake', `tap reaction · ${sTap.clip}`, sTap);
  else fail('T06-tap-awake', 'no tap reaction', sTap);

  page.onPetDebugReset && page.onPetDebugReset();
  await sleep(400);
  cat = page.selectComponent('#homeCat');
  const sReset = snap(cat);
  if (sReset && sReset.micro && sReset.loop) pass('T07-reset', 'debug reset ok', sReset);
  else fail('T07-reset', 'after reset unhealthy', sReset);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return { passed, failed, total: results.length, results };
  })();
}
