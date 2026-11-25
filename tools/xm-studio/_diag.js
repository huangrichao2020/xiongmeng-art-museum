const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [], cons = [];
  pg.on('pageerror', e => errs.push(String(e.stack||e).slice(0,600)));
  pg.on('console', m => { if (m.type()==='error'||m.type()==='warning') cons.push(m.type()+': '+m.text().slice(0,300)); });
  pg.on('requestfailed', r => cons.push('REQFAIL: '+r.url().slice(0,120)+' '+ (r.failure()&&r.failure().errorText)));
  await pg.goto('https://preview.ai10088.com/alex-garage/?ui', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForTimeout(20000);
  const st = await pg.evaluate(() => ({ hasMP: !!window.MP, hasDio: !!window.diorama, hasFreeze: !!(window.MP&&window.MP.freezeCam), url: location.href }));
  console.log('STATE =', JSON.stringify(st));
  console.log('PAGEERRORS:\n' + (errs.join('\n---\n')||'(none)'));
  console.log('CONSOLE:\n' + (cons.slice(0,25).join('\n')||'(none)'));
  await b.close();
})();
