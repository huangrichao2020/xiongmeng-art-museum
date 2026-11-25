// 定位：喷泉近景顶部黄板 / 市集角落绿锥
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e.stack || e).slice(0, 300)));
  await pg.goto('http://127.0.0.1:8899/?ui&audit=1', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(13000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    if (window.__fp) window.__fp.on = false;
    if (window.MP && window.MP.exitWalk) window.MP.exitWalk();
  });
  await pg.waitForTimeout(2500);

  const shot = async (id, pos, look) => {
    await pg.evaluate(([p, l]) => { window.MP.freezeCam(p[0], p[1], p[2], l[0], l[1], l[2]); }, [pos, look]);
    await pg.waitForTimeout(1800);
    await pg.screenshot({ path: '/tmp/pick_' + id + '.png' });
    console.log('shot', id);
  };
  const pick = async (pts, label) => {
    const r = await pg.evaluate(ps => ps.map(p => window.diorama.pick(p[0], p[1])), pts);
    console.log('=== ' + label);
    pts.forEach((p, i) => console.log('  (' + p[0] + ',' + p[1] + ') ->', JSON.stringify((r[i] || []).slice(0, 3))));
  };

  await shot('fl', [-19.6, 2.3, 4.6], [-24.4, 1.3, 0.2]);
  await pick([[120, 40], [400, 30], [700, 20], [1000, 10]], 'fountain_low 顶部黄板');

  await shot('mc', [-33.5, 4.2, -14.5], [-42, 1.2, -11]);
  await pick([[340, 265], [330, 300], [300, 250]], 'market_corner 绿锥');
  await b.close();
})();
