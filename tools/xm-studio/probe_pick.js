// 屏幕拾取：定位画面里的黑色大锥到底是什么
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e.stack || e).slice(0, 400)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
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
    pts.forEach((p, i) => {
      console.log('  (' + p[0] + ',' + p[1] + ') ->', JSON.stringify(r[i].slice(0, 4)));
    });
  };

  await shot('lot', [-19.5, 5.0, 9.2], [-13.5, 0.9, 0.5]);
  await pick([[690, 250], [700, 300], [660, 200], [760, 350], [560, 150], [820, 430]], 'lot 黑色大锥');

  await shot('fountain', [-16.0, 5.4, 8.2], [-24.4, 1.8, 0.2]);
  await pick([[800, 380], [790, 330], [830, 430], [860, 300], [600, 250]], 'fountain 黑色大锥');

  await b.close();
})();
