// 列出 west / parking 组的大部件及其包围盒，定位那个黑色大锥
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e.stack || e).slice(0, 300)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(12000);
  const r = await pg.evaluate(() => {
    const out = {};
    for (const tag of ['west', 'parking']) {
      const ps = window.diorama.parts(tag) || [];
      out[tag] = ps.map(p => ({ ty: p.ty, mt: p.mt, sz: p.sz, ct: p.ct, cnt: p.cnt }))
        .filter(p => Math.max(...p.sz) > 1.2)
        .sort((a, b) => Math.max(...b.sz) - Math.max(...a.sz)).slice(0, 22);
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
