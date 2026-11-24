/* 钢琴广场选址：集市西南角空地 */
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
    ['H_top', -36, 26, -3, -36, 0, -10.5],
    ['I_street', -32.4, 2.2, -5.5, -36.8, 1.0, -11.0],
    ['J_fromplaza', -41.8, 3.2, 0.2, -35.5, 1.2, -10.5],
    ['K_corner', -33.0, 3.0, -8.0, -37.5, 1.0, -11.5],
  ];
  for (const [n, px, py, pz, tx, ty, tz] of shots) {
    await pg.evaluate(a => MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), [px, py, pz, tx, ty, tz]);
    await pg.waitForTimeout(1300);
    await pg.screenshot({ path: '/tmp/pn_' + n + '.png' });
    console.log('shot', n);
  }
  /* 该区域 0.5m 精度：最高物高度 */
  const grid = await pg.evaluate(() => {
    const res = [];
    for (let x = -43; x <= -30; x += 0.5) {
      const row = [];
      for (let z = -17; z <= -5; z += 0.5) {
        const h = window.diorama.ray(x, 60, z, x, -1, z);
        const top = h && h.length ? (60 - h[0].d) : -1;
        row.push(top < 0.35 ? '.' : (top < 2 ? 'o' : '#'));
      }
      res.push({ x, row });
    }
    return res;
  });
  console.log('     ' + Array.from({ length: 25 }, (_, i) => String((i % 10)).slice(-1)).join(''));
  for (const r of grid) console.log('x=' + r.x.toFixed(1).padStart(6) + ' ' + r.row.join(''));
  console.log('z 从 -17 到 -5 步长 0.5；. 空地  o 矮物  # 高物');
  await b.close();
})();
