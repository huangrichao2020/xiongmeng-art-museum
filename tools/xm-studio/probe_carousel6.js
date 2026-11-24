const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 640 } })).newPage();
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await pg.evaluate(() => { try { window.diorama.ride('carousel'); } catch (e) { } });
  for (let i = 0; i < 10; i++) { await pg.waitForTimeout(400); await pg.screenshot({ path: '/tmp/cr_' + i + '.png' }); }
  console.log('[10 帧]');
  await b.close();
})();
