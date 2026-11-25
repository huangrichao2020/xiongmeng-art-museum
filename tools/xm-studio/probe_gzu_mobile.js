/* 校区上线前：小米视口（393×873）体检 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.LOCAL_URL || 'http://127.0.0.1:8899/index.html?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 873 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 120000 });
  await pg.waitForTimeout(5000);
  await pg.evaluate(() => { const l = document.getElementById('mp-login'); if (l) l.style.display = 'none'; });
  await pg.evaluate(() => { window.MP.freezeCam(24, 1.7, 2, 0, 16, -66); });
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: '/tmp/gzu-mobile.png' });
  const perf = await pg.evaluate(() => window.diorama.perf());
  console.log('MOBILE PERF=' + JSON.stringify(perf));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
