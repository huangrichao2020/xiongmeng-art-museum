/* 西南角全景 + 1m 精度空地网格 */
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
    ['E_sw_wide', -38, 62, 10, -38, 0, -4],
    ['F_plaza', -41.8, 9, 10, -41.8, 3, 0.2],
    ['G_sw_field', -38, 14, -6, -38, 0, -13],
  ];
  for (const [n, px, py, pz, tx, ty, tz] of shots) {
    await pg.evaluate(a => MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), [px, py, pz, tx, ty, tz]);
    await pg.waitForTimeout(1300);
    await pg.screenshot({ path: '/tmp/mk_' + n + '.png' });
    console.log('shot', n);
  }
  /* 1m 网格：空地 = 最高物 < 0.35m（地面/铺装），并标记高物 */
  const grid = await pg.evaluate(() => {
    const res = [];
    for (let x = -50; x <= -28; x += 1) {
      const row = [];
      for (let z = -18; z <= 14; z += 1) {
        const h = window.diorama.ray(x, 40, z, x, -1, z);
        const top = h && h.length ? (40 - h[0].d) : -1;
        row.push(top < 0.35 ? '.' : (top < 2 ? 'o' : '#'));
      }
      res.push({ x, row });
    }
    return res;
  });
  console.log('     ' + Array.from({ length: 33 }, (_, i) => String((i % 10)).slice(-1)).join(''));
  for (const r of grid) console.log('x=' + String(r.x).padStart(4) + ' ' + r.row.join(''));
  console.log('z 从 -18 到 14 步长 1；. = 空地(<0.35m)  o = 矮物  # = 高物');
  await b.close();
})();
