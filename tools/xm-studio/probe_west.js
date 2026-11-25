/* 西区现状：喷泉花坛 + 停车场 + 钢琴广场（本地预览，白天/夜晚各一套） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1180, height: 760 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 300)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(13000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    if (window.__fp) { window.__fp.on = false; }
    if (window.MP && window.MP.exitWalk) window.MP.exitWalk();
  });
  await pg.waitForTimeout(2500);

  const shot = async (id, pos, look, wait = 1800) => {
    await pg.evaluate(([p, l]) => { window.MP.freezeCam(p[0], p[1], p[2], l[0], l[1], l[2]); }, [pos, look]);
    await pg.waitForTimeout(wait);
    await pg.screenshot({ path: '/tmp/west_' + id + '.png' });
    console.log('shot', id);
  };

  await shot('top', [-22, 46, 2], [-24, 0, 0]);
  await shot('fountain', [-24.4, 4.2, 9.5], [-24.4, 1.6, 0.2]);
  await shot('fountain_low', [-17, 2.6, 6.5], [-24.4, 1.4, 0.2]);
  await shot('lot', [-4.5, 6.5, -2.5], [-18, 1.0, 1.5]);
  await shot('lot_top', [-14, 22, 6], [-14, 0, 0]);
  await shot('piano', [-30, 5.5, -6], [-40.4, 1.5, -10.4]);
  console.log('错误:', errs.length, errs.slice(0, 2));
  await b.close();
})();
