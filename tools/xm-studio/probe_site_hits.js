/* 广场选址区逐格命中物（geo + 颜色），确认空地上没有遗留物件 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 140)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  const rows = await pg.evaluate(() => {
    const out = [];
    for (let z = -15; z <= -6; z += 1) {
      const cells = [];
      for (let x = -46; x <= -35; x += 1) {
        const h = window.diorama.ray(x, 30, z, x, -1, z);
        if (!h || !h.length) { cells.push('.'); continue; }
        const top = 30 - h[0].d;
        if (top < 0.35) { cells.push('.'); continue; }
        cells.push(h[0].col || '#');
      }
      out.push('z=' + String(z).padStart(4) + ' ' + cells.join(' '));
    }
    return out;
  });
  console.log('x 从 -46 到 -35');
  for (const r of rows) console.log(r);
  await b.close();
})();
