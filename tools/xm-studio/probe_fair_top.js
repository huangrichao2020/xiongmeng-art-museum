/* 游乐园区域俯视图：看清旋转木马 / 留言亭 / 周边空地与马路 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  await pg.evaluate(() => { const el = document.getElementById('hour'); el.value = '13'; el.dispatchEvent(new Event('input')); });
  await pg.waitForTimeout(1200);
  const shots = [
    ['fair_all', 4, 78, 30, 4, 0, 30],
    ['fair_s', 4, 55, 44, 4, 0, 30],
    ['fair_w', -18, 55, 30, 4, 0, 30]
  ];
  for (const [name, px, py, pz, tx, ty, tz] of shots) {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), [px, py, pz, tx, ty, tz]);
    await pg.waitForTimeout(1300);
    await pg.screenshot({ path: `/tmp/f_${name}.png` });
    console.log('shot', name);
  }
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
