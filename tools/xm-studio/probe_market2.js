/* 集市角落俯视 + 空地网格（沙盘 ?ui 模式 + 冻结机位） */
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
  const c0 = await pg.evaluate(() => window.diorama.cam());
  console.log('cam0', JSON.stringify(c0));
  /* 角落俯视 */
  await pg.evaluate(() => MP.freezeCam(-31, 30, -2, -33.0, 0, -11.0));
  await pg.waitForTimeout(1200);
  console.log('cam1', JSON.stringify(await pg.evaluate(() => window.diorama.cam())));
  await pg.screenshot({ path: '/tmp/mk_corner_top.png' });
  /* 从东往角落平视 */
  await pg.evaluate(() => MP.freezeCam(-25, 4.0, -5, -34, 1.2, -12));
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: '/tmp/mk_corner_view.png' });
  /* 网格：命中物列表（看第一个命中是谁 + 高度） */
  const grid = await pg.evaluate(() => {
    const res = [];
    for (let x = -40; x <= -24; x += 1.5) {
      const row = [];
      for (let z = -18; z <= 6; z += 1.5) {
        const h = window.diorama.ray(x, 40, z, x, -1, z);
        const top = h && h.length ? (40 - h[0].d) : -1;
        row.push(top < 0.05 ? 0 : +top.toFixed(1));
      }
      res.push({ x, row });
    }
    return res;
  });
  for (const r of grid) console.log('x=' + r.x.toFixed(1).padStart(6), r.row.map(v => String(v).padStart(5)).join(''));
  console.log('z 从 -18 到 6 步长 1.5；数字=该格最高物体高度(m)，0=空地');
  await b.close();
})();
