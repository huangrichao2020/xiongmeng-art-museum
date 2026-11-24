/* 三个候选空地：L 拐角 / 北排摊位北侧空场 / 市集街南端 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 140)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await pg.waitForTimeout(600);
  const shots = [
    ['L_corner', -30.5, 4.0, -6.0, -34.0, 1.0, -12.0],
    ['M_northlot', -30.0, 6.0, -11.0, -30.5, 0.5, -17.0],
    ['M_northlot_top', -30, 20, -10, -30.5, 0, -16],
    ['N_southend', -31.5, 5.0, 4.0, -31.0, 1.0, 11.0],
    ['N_southend_top', -31, 22, 4, -31, 0, 12],
  ];
  for (const [n, px, py, pz, tx, ty, tz] of shots) {
    await pg.evaluate(a => MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), [px, py, pz, tx, ty, tz]);
    await pg.waitForTimeout(1300);
    await pg.screenshot({ path: '/tmp/pn_' + n + '.png' });
    console.log('shot', n);
  }
  await b.close();
})();
