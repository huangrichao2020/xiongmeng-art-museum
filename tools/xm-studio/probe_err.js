/* 抓页面加载期的报错 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('PAGEERROR:', String(e.stack || e).slice(0, 900)));
  pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE[' + m.type() + ']:', String(m.text()).slice(0, 300)); });
  pg.on('response', r => { if (r.status() >= 400) console.log('HTTP' + r.status() + ':', r.url().slice(0, 140)); });
  pg.on('requestfailed', r => console.log('REQFAIL:', r.url().slice(0, 120), r.failure() && r.failure().errorText));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 60000 });
  await pg.waitForTimeout(25000);
  const st = await pg.evaluate(() => ({ hasMP: !!window.MP, hasDio: !!window.diorama, ready: document.readyState }));
  console.log('状态:', JSON.stringify(st));
  await b.close();
})();
