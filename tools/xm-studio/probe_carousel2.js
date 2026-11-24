/* 木马到底转不转：定点拍两帧比对 + 骑上去看相机是否绕圈 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 140)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(7000);
  /* 隐掉登录卡片 */
  await pg.evaluate(() => { const w=document.getElementById('mp-login'); if(w) w.style.display='none'; });
  /* 直接骑上去，在木马上拍两帧 */
  await pg.evaluate(() => { try { window.diorama.ride('carousel'); } catch (e) { } });
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: '/tmp/car_t0.png' });
  await pg.waitForTimeout(3000);
  await pg.screenshot({ path: '/tmp/car_t3.png' });
  console.log('[定点两帧已存]');
  /* 骑乘时相机轨迹 */
  const pts = [];
  for (let i = 0; i < 8; i++) {
    await pg.waitForTimeout(500);
    pts.push(await pg.evaluate(() => { const c = window.diorama.cam(); return [c.x, c.z]; }));
  }
  console.log('[骑乘时相机轨迹]', JSON.stringify(pts));
  await b.close();
})();
