/* 主站地面视角截图：定传送门落点观感用 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => {
    const e = document.getElementById('mp-login'); if (e) e.style.display = 'none';
    const T = window.XM_TOUR;
    T.stopDirector(); T.setHour(12);
  });
  await pg.waitForTimeout(600);

  const shot = async (name, cam, tgt) => {
    await pg.evaluate(([c, t]) => {
      const T = window.XM_TOUR;
      T.camera.position.set(c[0], c[1], c[2]);
      T.camera.fov = 60; T.camera.updateProjectionMatrix();
      T.controls.target.set(t[0], t[1], t[2]);
      T.controls.update();
    }, [cam, tgt]);
    await pg.waitForTimeout(900);
    await pg.screenshot({ path: '/tmp/' + name + '.png' });
    console.log('→ /tmp/' + name + '.png');
  };

  await shot('site_south_a', [0, 6, 6], [-2, 3, 24]);   // 正门往南看候选点
  await shot('site_south_b', [-2, 4, 14], [0, 2, 30]);  // 从马路南侧往回看正门
  await b.close();
})();
