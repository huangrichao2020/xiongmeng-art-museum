/* 材质体检：找出还在裸奔的纯色大面积表面 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const accs = pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await pg.goto('https://preview.ai10088.com/alex-garage/?ui', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 120000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate((a) => {
    const A = document.getElementById('mp-acc'), P = document.getElementById('mp-pass');
    if (A && P) { A.value = a; P.value = '123456'; document.getElementById('mp-go').click(); }
  }, accs.a);
  await pg.waitForFunction(() => window.MP && window.MP.connected, null, { timeout: 30000 }).catch(() => { });
  await pg.waitForTimeout(2500);
  const r = await pg.evaluate(() => window.diorama.sceneAudit());
  console.log(JSON.stringify(r, null, 0));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
