/* 加载报错抓取 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', String(e.stack || e).slice(0, 900)));
  pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE_ERR:', m.text().slice(0, 400)); });
  await pg.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForTimeout(12000);
  const st = await pg.evaluate(() => ({
    hasMP: !!window.MP, hasDio: !!window.diorama, hasFp: !!(window.diorama && window.diorama.fp),
    build: (document.querySelector('meta[name=xm-build]') || {}).content
  }));
  console.log('STATE', JSON.stringify(st));
  await b.close();
})();
