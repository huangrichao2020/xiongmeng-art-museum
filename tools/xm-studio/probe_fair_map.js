/* 游乐园空地网格 */
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
  await pg.evaluate(() => MP.freezeCam(12, 46, 52, 12, 0, 26));
  await pg.waitForTimeout(1400);
  await pg.screenshot({ path: '/tmp/fk_top.png' });
  console.log('top shot', JSON.stringify(await pg.evaluate(() => window.diorama.cam())));
  const grid = await pg.evaluate(() => {
    const res = [];
    for (let x = -16; x <= 52; x += 1) {
      const row = [];
      for (let z = 8; z <= 56; z += 1) {
        const h = window.diorama.ray(x, 60, z, x, -1, z);
        const top = h && h.length ? (60 - h[0].d) : -1;
        row.push(top < 0.4 ? '.' : (top < 2 ? 'o' : '#'));
      }
      res.push({ x, row });
    }
    return res;
  });
  console.log('     ' + Array.from({ length: 49 }, (_, i) => String((i % 10)).slice(-1)).join(''));
  for (const r of grid) console.log('x=' + String(r.x).padStart(4) + ' ' + r.row.join(''));
  console.log('z 从 8 到 56 步长 1；. = 空地(<0.4m)  o = 矮物  # = 高物');
  await b.close();
})();
