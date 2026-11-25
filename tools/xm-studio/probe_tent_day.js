/* 同一机位，白天/夜晚各拍一张帐内全景：确认不吃光的内衬在白天不会变成一块死黑 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  const shot = async (hour, tag, cam) => {
    await pg.evaluate(h => { const el = document.getElementById('hour'); el.value = String(h); el.dispatchEvent(new Event('input')); }, hour);
    await pg.waitForTimeout(1800);
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1400);
    await pg.screenshot({ path: '/tmp/td_' + tag + '.png' });
  };
  const CAM = [50, 2.2, 35.5, 50, 1.4, 30];
  await shot(13, 'day_in', CAM);
  await shot(21.5, 'night_in', CAM);
  await shot(21.5, 'night_out', [50, 9, 48, 50, 4, 30]);
  await shot(13, 'day_out', [50, 9, 48, 50, 4, 30]);
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
