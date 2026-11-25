const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e.stack || e).slice(0, 500)));
  pg.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForTimeout(30000);
  const st = await pg.evaluate(() => ({ MP: !!window.MP, diorama: !!window.diorama, ready: document.readyState }));
  console.log('state', JSON.stringify(st));
  await b.close();
})();
