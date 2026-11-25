/* 经济系统外观核查：退出第一人称后定点截图 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 300)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama && window.ECON, null, { timeout: 180000 });
  await pg.waitForTimeout(13000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    /* 退出第一人称，否则相机每帧被拉回角色身后 */
    if (window.__fp) { window.__fp.on = false; }
    if (window.MP && window.MP.exitWalk) window.MP.exitWalk();
  });
  await pg.waitForTimeout(2500);

  const shots = [
    ['e3_jobs', [16, 11, 20.5], [16, 1, 30.5]],
    ['e3_photo', [19.8, 4.0, 21.0], [19.8, 1.3, 30.0]],
    ['e3_tripod', [17.6, 2.2, 30.5], [19.0, 1.3, 28.6]],
    ['e3_backdrop', [19.8, 2.4, 29.5], [19.8, 1.5, 24.0]],
    ['e3_bumper', [-17, 5.5, 45], [-10.6, 0.6, 45]],
    ['e3_wheel', [27, 5, 50], [27, 1.0, 43.5]],
  ];
  for (const [id, pos, look] of shots) {
    await pg.evaluate(([p, l]) => { if (window.MP) window.MP.freezeCam(p[0], p[1], p[2], l[0], l[1], l[2]); }, [pos, look]);
    await pg.waitForTimeout(2000);
    await pg.screenshot({ path: '/tmp/' + id + '.png' });
    console.log('shot', id);
  }
  console.log('错误:', errs.length, errs.slice(0, 3));
  await b.close();
})();
