/* 打工链路体检：上岗提示 + 摄影拍照
   用法：node probe_econ.js */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const W = 390, H = 844;
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama && window.ECON && window.photoSys, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { const el = document.getElementById('mp-login'); if (el) el.style.display = 'none'; });
  await pg.waitForTimeout(1000);

  const hud = () => pg.evaluate(() => ({
    msg: document.getElementById('train-msg').textContent,
    btn: document.getElementById('train-btn').textContent,
    show: document.getElementById('train-hud').classList.contains('show'),
    photoOn: window.photoSys.on,
    hasNpc: !!window.photoSys.npc,
    cool: +window.photoSys.cool.toFixed(2),
    aimed: window.photoSys.aimed,
    state: document.getElementById('ph-state').textContent,
    coin: window.ECON.coin, earned: window.ECON.earned, shots: window.ECON.shots,
    shiftId: (window.ECON_SHIFT ? window.ECON_SHIFT.id : 'n/a')
  }));

  // 站到摄影摊工位
  await pg.evaluate(() => { diorama.heliWalkTo(19.8, 28.0); window.__fp.yaw = 0; });
  await pg.waitForTimeout(1200);
  console.log('站位:', JSON.stringify(await pg.evaluate(() => diorama.fp.get())));
  console.log('上岗前提示:', JSON.stringify(await hud()));

  // 真的点一下「上岗」按钮
  await pg.evaluate(() => { const b = document.getElementById('train-btn'); b.click(); });
  await pg.waitForTimeout(1500);
  console.log('点上岗后 1.5s:', JSON.stringify(await hud()));
  await pg.waitForTimeout(3000);
  console.log('点上岗后 4.5s:', JSON.stringify(await hud()));

  // 等客人走过来
  for (let i = 0; i < 12; i++) {
    await pg.waitForTimeout(2000);
    const h = await hud();
    console.log(`  等待 ${(i + 1) * 2}s:`, JSON.stringify(h));
    if (h.hasNpc && h.aimed) break;
  }

  // 对着客人转相机：算需要的 yaw
  const aim = await pg.evaluate(() => {
    const n = window.photoSys.npc;
    if (!n) return null;
    const cam = window.XM_TOUR.camera;
    const dx = n.p.position.x - cam.position.x, dz = n.p.position.z - cam.position.z;
    return { dist: +Math.hypot(dx, dz).toFixed(2), wantYaw: +Math.atan2(-dx, -dz).toFixed(3), camY: +cam.rotation.y.toFixed(3) };
  });
  console.log('客人位置/距离/应转 yaw:', JSON.stringify(aim));
  if (aim) {
    await pg.evaluate((y) => { window.__fp.yaw = y; }, aim.wantYaw);
    await pg.waitForTimeout(900);
    console.log('对准后:', JSON.stringify(await hud()));
  }

  // 按快门（手机按钮）
  await pg.evaluate(() => document.getElementById('ph-shoot').click());
  await pg.waitForTimeout(1200);
  console.log('第 1 次快门后:', JSON.stringify(await hud()));
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => document.getElementById('ph-shoot').click());
  await pg.waitForTimeout(1200);
  console.log('第 2 次快门后:', JSON.stringify(await hud()));
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => document.getElementById('ph-shoot').click());
  await pg.waitForTimeout(1200);
  console.log('第 3 次快门后:', JSON.stringify(await hud()));

  console.log('报错:', errs.length, errs.slice(0, 4));
  await b.close();
})();
