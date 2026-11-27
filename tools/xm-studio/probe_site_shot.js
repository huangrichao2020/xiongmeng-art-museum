/* 主站俯视截图：定传送门落点用 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => {
    const T = window.XM_TOUR;
    T.stopDirector();
    T.setHour(12);
    T.camera.position.set(0, 190, 80);
    T.camera.fov = 55; T.camera.updateProjectionMatrix();
    T.controls.target.set(0, 0, 0);
    T.controls.update();
  });
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: '/tmp/site_top.png' });
  console.log('俯视 → /tmp/site_top.png');

  await pg.evaluate(() => {
    const T = window.XM_TOUR;
    T.camera.position.set(0, 12, 6);
    T.camera.fov = 60; T.camera.updateProjectionMatrix();
    T.controls.target.set(0, 3, 26);
    T.controls.update();
  });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: '/tmp/site_gate_south.png' });
  console.log('正门往南看 → /tmp/site_gate_south.png');
  await b.close();
})();
