/* 远景小件剔除的视觉对比（2026-11-26）
   同一机位拍「剔除开 / 剔除关」两张，外加像素差，用来确认远处的小东西
   消失后画面没有塌（尤其馆内展品、熊、栏杆）。
   用法： node probe_cull_shots.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

const VIEWS = [
  ['plaza', [0, 2.2, 2, 0, 3.2, 8]],
  ['aerial', [0, 150, 70, 0, 0, 0]],
  ['market', [-30, 2.0, -4, -36, 1.6, -12]],
  ['bus', [-30, 2.0, 15, -29.5, 2.2, 9.5]],
  ['museum_in', [1.5, 1.7, 4.0, 1.0, 1.6, -6]],
  ['garden', [-16, 2.0, 6, -24.4, 2.0, 0.2]]
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    window.XM_TOUR.stopDirector();
  });
  await pg.waitForTimeout(9000);

  for (const [name, cam] of VIEWS) {
    await pg.evaluate(() => { window.XM_TOUR.DC.off = false; });
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1600);
    await pg.screenshot({ path: `/tmp/cull_${name}_on.png` });
    // 临时关掉剔除再拍
    await pg.evaluate(() => {
      const T = window.XM_TOUR;
      T.DC.off = true;                       // 关掉剔除
      T.DC.list.forEach(it => { if (it.hidden) { it.o.visible = true; it.hidden = false; } });
    });
    await pg.waitForTimeout(900);
    await pg.screenshot({ path: `/tmp/cull_${name}_off.png` });
    console.log('shot', name);
  }
  await b.close();
})();
