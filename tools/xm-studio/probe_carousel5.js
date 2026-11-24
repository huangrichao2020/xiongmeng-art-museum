/* 从外面看旋转木马：确认马背上没人 + 木马在转 */
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
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await pg.evaluate(() => MP.freezeCam(4, 5.2, 41.5, 4, 2.6, 30));
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: '/tmp/car_out.png' });
  await pg.waitForTimeout(2600);
  await pg.screenshot({ path: '/tmp/car_out2.png' });
  console.log('[ok]');
  await b.close();
})();
