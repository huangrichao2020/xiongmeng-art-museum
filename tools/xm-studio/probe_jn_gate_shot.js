/* 主站传送门造型截图：从南边正对门楼 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => {
    const e = document.getElementById('mp-login'); if (e) e.style.display = 'none';
    const T = window.XM_TOUR;
    T.stopDirector();
  });
  await pg.waitForTimeout(500);
  const shot = async (name, cam, tgt, hour) => {
    await pg.evaluate(([c, t, h]) => {
      const T = window.XM_TOUR;
      T.setHour(h);
      T.camera.position.set(c[0], c[1], c[2]);
      T.camera.fov = 58; T.camera.updateProjectionMatrix();
      T.controls.target.set(t[0], t[1], t[2]);
      T.controls.update();
    }, [cam, tgt, hour]);
    await pg.waitForTimeout(1100);
    await pg.screenshot({ path: '/tmp/' + name + '.png' });
    console.log('→ /tmp/' + name + '.png');
  };
  await shot('jn_gate_front', [-2, 2.6, 25], [-2, 2.6, 18], 12);
  await shot('jn_gate_night', [-2, 2.6, 24], [-2, 2.4, 18], 21.5);
  await shot('jn_gate_wide', [-2, 8, 34], [-2, 3, 18], 12);
  await b.close();
})();
