/* draw call 观测：登录前后 + 第三人称 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || '');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 760 } });
  const pg = await c.newPage();
  await pg.goto('https://preview.ai10088.com/alex-garage/', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(8000);
  console.log('[未登录]', JSON.stringify(await pg.evaluate(() => window.diorama.perf())));
  await pg.fill('#mp-acc', ACC.a); await pg.fill('#mp-pass', '123456'); await pg.click('#mp-go');
  await pg.waitForTimeout(4000);
  console.log('[登录后]', JSON.stringify(await pg.evaluate(() => window.diorama.perf())));
  await pg.evaluate(() => MP.toggleThird()); await pg.waitForTimeout(2500);
  const s = [];
  for (let i = 0; i < 5; i++) { await pg.waitForTimeout(700); s.push(await pg.evaluate(() => window.diorama.perf().calls)); }
  console.log('[第三人称 draw calls 采样]', JSON.stringify(s));
  await b.close();
})();
