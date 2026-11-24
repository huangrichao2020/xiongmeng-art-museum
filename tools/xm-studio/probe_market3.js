/* 定位「集市角落空地」：站在市集街上往角落看 + 大范围俯视 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 140)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await pg.waitForTimeout(600);
  const shots = [
    ['A_street_to_corner', -32.6, 2.4, 1.0, -33.2, 0.6, -11.0],
    ['B_corner_close', -30.0, 3.0, -6.5, -34.5, 0.6, -11.5],
    ['C_wide_top', -36.0, 48.0, 14.0, -36.0, 0.0, -6.0],
    ['D_south_end', -32.6, 3.0, 12.0, -34.0, 1.0, 2.0],
  ];
  for (const [n, px, py, pz, tx, ty, tz] of shots) {
    await pg.evaluate(a => MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), [px, py, pz, tx, ty, tz]);
    await pg.waitForTimeout(1300);
    await pg.screenshot({ path: '/tmp/mk_' + n + '.png' });
    console.log('shot', n, JSON.stringify(await pg.evaluate(() => window.diorama.cam())));
  }
  await b.close();
})();
