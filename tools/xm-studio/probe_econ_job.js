/* 售票处上岗体检：上岗提示 + 客人来买票 + 雪币到账 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama && window.ECON, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { const el = document.getElementById('mp-login'); if (el) el.style.display = 'none'; });
  await pg.waitForTimeout(1000);
  const hud = () => pg.evaluate(() => ({
    msg: document.getElementById('train-msg').textContent,
    btn: document.getElementById('train-btn').textContent,
    coin: window.ECON.coin, earned: window.ECON.earned,
    buyer: !!window.ECON.ticketBuyer,
    job: window.econNearestJob() ? window.econNearestJob().id : null
  }));
  await pg.evaluate(() => { diorama.heliWalkTo(13.6, 25.2); window.__fp.yaw = Math.PI; });
  await pg.waitForTimeout(1200);
  console.log('站位:', JSON.stringify(await pg.evaluate(() => diorama.fp.get())));
  console.log('上岗前:', JSON.stringify(await hud()));
  await pg.evaluate(() => document.getElementById('train-btn').click());
  await pg.waitForTimeout(1500);
  console.log('点上岗后:', JSON.stringify(await hud()));
  for (let i = 0; i < 10; i++) {
    await pg.waitForTimeout(2000);
    const h = await hud();
    console.log(`  ${(i + 1) * 2}s:`, JSON.stringify(h));
    if (h.earned > 0) break;
  }
  // 走远：应该强制收摊，提示条回到"上岗"
  await pg.evaluate(() => diorama.heliWalkTo(0, 0));
  await pg.waitForTimeout(1500);
  console.log('走远后:', JSON.stringify(await hud()));
  console.log('报错:', errs.length, errs.slice(0, 3));
  await b.close();
})();
