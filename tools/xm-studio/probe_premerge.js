// 合批前快照：列出喷泉庭院四角 x∈[-31,-17] 区域的所有高于 1.5m 的物件
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e.stack || e).slice(0, 300)));
  await pg.goto('http://127.0.0.1:8899/?ui&audit=1', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.__xmPreMerge && window.__xmPreMerge.length, null, { timeout: 180000 });
  await pg.waitForTimeout(3000);
  const r = await pg.evaluate(() => {
    return window.__xmPreMerge.filter(o => {
      const cx = (o.mn[0] + o.mx[0]) / 2, cz = (o.mn[2] + o.mx[2]) / 2;
      const h = o.mx[1] - o.mn[1];
      return h > 1.2 && cx > -32 && cx < -16.5 && cz > -8 && cz < 9;
    }).map(o => ({ gt: o.gt, c: o.c, chain: o.chain,
      mn: o.mn, mx: o.mx,
      sz: [+(o.mx[0] - o.mn[0]).toFixed(2), +(o.mx[1] - o.mn[1]).toFixed(2), +(o.mx[2] - o.mn[2]).toFixed(2)],
      ct: [+((o.mn[0] + o.mx[0]) / 2).toFixed(2), +((o.mn[1] + o.mx[1]) / 2).toFixed(2), +((o.mn[2] + o.mx[2]) / 2).toFixed(2)] }));
  });
  console.log('count', r.length);
  r.forEach(o => console.log(o.gt, o.c, 'sz', o.sz.join('x'), 'ct', o.ct.join(','), '|', o.chain));
  await b.close();
})();
