/* 木马骑手是否已删 + 流星带粗细对比 */
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

  /* 1) 骑上木马立刻拍（能看见马背有没有人） */
  await pg.evaluate(() => { try { window.diorama.ride('carousel'); } catch (e) { } });
  await pg.waitForTimeout(2200);
  await pg.screenshot({ path: '/tmp/car_rider_check.png' });

  /* 2) 抬头看天，连拍 12 秒抓流星带 */
  await pg.evaluate(() => { if (window.diorama.fp.get().on) document.getElementById('t-fp').click(); });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => MP.freezeCam(0, 5, 18, 2, 26, 26));
  for (let i = 0; i < 12; i++) {
    await pg.waitForTimeout(1200);
    await pg.screenshot({ path: '/tmp/met_' + i + '.png' });
  }
  console.log('[12 帧天空已存]');
  await b.close();
})();
