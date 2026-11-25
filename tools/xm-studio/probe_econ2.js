/* 经济系统功能核查：上车收费 / 卖票 / 拍照 / 包装 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('CONSOLE:' + m.text().slice(0, 200)); });
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama && window.ECON && window.__fp, null, { timeout: 180000 });
  await pg.waitForTimeout(13000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  });
  await pg.waitForTimeout(800);

  /* ── 1. 走到上车点 → 按 E → 扣钱 + 上车 ── */
  const ride = await pg.evaluate(async () => {
    const R = window.ECON_RIDES.find(r => r.id === 'carousel');
    const fp = window.__fp;
    fp.on = true; fp.x = R.x; fp.z = R.z; fp.y = 0; fp.vx = fp.vz = 0;
    await new Promise(r => setTimeout(r, 400));
    const near = window.econNearestPad();
    const before = window.ECON.coin;
    const ok = window.econBoard('carousel');
    await new Promise(r => setTimeout(r, 500));
    return { near: near && near.id, before, after: window.ECON.coin, ok, riding: !!(window.MP && window.MP.diorama) };
  });
  console.log('上车：', JSON.stringify(ride));

  /* ── 2. 下车 + 钱不够的情况 ── */
  await pg.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    await new Promise(r => setTimeout(r, 900));
  });
  const poor = await pg.evaluate(async () => {
    window.ECON.coin = 3;
    const before = window.ECON.coin;
    window.econBoard('coaster');
    await new Promise(r => setTimeout(r, 300));
    return { before, after: window.ECON.coin, msg: (document.getElementById('xmsg') || {}).textContent };
  });
  console.log('钱不够：', JSON.stringify(poor));

  /* ── 3. 卖票：叫一个小熊过来 → 自动成交 ── */
  const ticket = await pg.evaluate(async () => {
    window.ECON.coin = 0; window.ECON.earned = 0;
    const J = window.ECON_JOBS[0];
    const fp = window.__fp;
    fp.on = true; fp.x = J.gx; fp.z = J.gz; fp.y = 0;
    await new Promise(r => setTimeout(r, 300));
    const job = window.econNearestJob();
    window.econJobDo ? window.econJobDo('ticket') : null;
    return { job: job && job.id };
  });
  console.log('工位识别：', JSON.stringify(ticket));
  /* econJobDo 没导出，这里直接调 */
  await pg.evaluate(() => { window.ECON.jobCd = 0; });
  const sold = await pg.evaluate(async () => {
    /* 通过按 E 触发：模拟 keydown */
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    await new Promise(r => setTimeout(r, 400));
    return { buyer: !!window.ECON.ticketBuyer, coin: window.ECON.coin };
  });
  console.log('叫客人：', JSON.stringify(sold));
  await pg.waitForTimeout(9000);
  const sold2 = await pg.evaluate(() => ({ coin: window.ECON.coin, earned: window.ECON.earned, buyer: !!window.ECON.ticketBuyer }));
  console.log('成交后：', JSON.stringify(sold2));

  /* ── 4. 摄影：开张 → 客人走来 → 对准拍照 ── */
  const photo = await pg.evaluate(async () => {
    const J = window.ECON_JOBS[1];
    const fp = window.__fp;
    fp.on = true; fp.x = J.gx; fp.z = J.gz; fp.y = 0;
    await new Promise(r => setTimeout(r, 300));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    await new Promise(r => setTimeout(r, 600));
    return { on: window.photoSys.on, hud: document.getElementById('photo-hud').className, state: (document.getElementById('ph-state') || {}).textContent };
  });
  console.log('摄影开张：', JSON.stringify(photo));
  await pg.waitForTimeout(11000);
  const photo2 = await pg.evaluate(() => {
    const ps = window.photoSys;
    return { hasNpc: !!ps.npc, state: (document.getElementById('ph-state') || {}).textContent,
             npcPos: ps.npc ? [+ps.npc.p.position.x.toFixed(1), +ps.npc.p.position.z.toFixed(1)] : null,
             camPos: window.diorama.cam() };
  });
  console.log('客人到位：', JSON.stringify(photo2));

  const shot = await pg.evaluate(async () => {
    const ps = window.photoSys;
    if (!ps.npc) return { skipped: true };
    const n = ps.npc;
    /* 把相机对准客人（改 fp 朝向） */
    const fp = window.__fp;
    const dx = n.p.position.x - fp.x, dz = n.p.position.z - fp.z;
    fp.yaw = Math.atan2(-dx, -dz);
    fp.pitch = -0.12;
    await new Promise(r => setTimeout(r, 900));
    const before = window.ECON.coin;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await new Promise(r => setTimeout(r, 600));
    return { before, after: window.ECON.coin, shots: window.ECON.shots, good: window.ECON.good,
             msg: (document.getElementById('xmsg') || {}).textContent };
  });
  console.log('拍照：', JSON.stringify(shot));

  /* ── 5. 包装礼物 ── */
  const wrap = await pg.evaluate(async () => {
    const J = window.ECON_JOBS[2];
    const fp = window.__fp;
    fp.on = true; fp.x = J.gx; fp.z = J.gz; fp.y = 0;
    await new Promise(r => setTimeout(r, 400));
    const before = window.ECON.coin;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    await new Promise(r => setTimeout(r, 500));
    return { before, after: window.ECON.coin, job: window.econNearestJob() && window.econNearestJob().id };
  });
  console.log('包装：', JSON.stringify(wrap));

  console.log('页面错误:', errs.length, errs.slice(0, 4));

  /* 截图 */
  const shots2 = [
    ['econ2_jobs', [16, 12, 21], [16, 1, 30]],
    ['econ2_photo', [19.8, 3.0, 20.0], [19.8, 1.2, 29.5]],
    ['econ2_bumper', [-16, 6, 45], [-10.6, 0.5, 45]],
  ];
  for (const [id, pos, look] of shots2) {
    await pg.evaluate(([p, l]) => { if (window.MP) window.MP.freezeCam(p[0], p[1], p[2], l[0], l[1], l[2]); }, [pos, look]);
    await pg.waitForTimeout(2200);
    await pg.screenshot({ path: '/tmp/' + id + '.png' });
    console.log('shot', id);
  }
  await b.close();
})();
