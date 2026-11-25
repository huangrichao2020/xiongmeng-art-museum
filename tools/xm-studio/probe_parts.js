const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const accs = pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.diorama && window.diorama.scene, null, { timeout: 120000 });
  await pg.evaluate((a) => {
    const A = document.getElementById('mp-acc'), P = document.getElementById('mp-pass');
    if (A && P) { A.value = a; P.value = '123456'; document.getElementById('mp-go').click(); }
  }, accs.a);
  await pg.waitForTimeout(10000);
  const parts = await pg.evaluate(() => window.diorama.parts('nest'));
  console.log('NEST PARTS ' + parts.length);
  parts.forEach(p => console.log(JSON.stringify(p)));
  await b.close();
})();
