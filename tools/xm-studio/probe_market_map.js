/* 集市角落俯视图 + 空地网格检测 */
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
  await pg.waitForTimeout(6000);
  /* 俯视整个集市区域 */
  await pg.evaluate(() => MP.freezeCam(-30, 42, -2, -30, 0, -2));
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: '/tmp/market_top.png' });
  /* 西南角低角度 */
  await pg.evaluate(() => MP.freezeCam(-22, 6.5, -22, -36, 1.5, -12));
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: '/tmp/market_corner.png' });
  /* 空地网格：向下打射线，看哪些格子只有地面 */
  const grid = await pg.evaluate(() => {
    const res = [];
    for (let x = -46; x <= -18; x += 2) {
      const row = [];
      for (let z = -22; z <= 12; z += 2) {
        const h = window.diorama.ray(x, 30, z, x, -1, z);
        row.push(h && h.length ? h[0].d : -1);   // 第一击距离（悬空越高说明越空）
      }
      res.push({ x, row });
    }
    return res;
  });
  for (const r of grid) console.log('x=' + String(r.x).padStart(4), r.row.map(v => (v < 0 ? '  .' : String(v).padStart(3))).join(''));
  console.log('列 = z 从 -22 到 12，步长 2；数字=第一个命中物离地面的高度');
  await b.close();
})();
