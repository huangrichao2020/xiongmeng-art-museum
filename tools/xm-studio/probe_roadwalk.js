/* 马路遮挡排查（第一人称真实视角）：站到马路上，看四个方向被什么挡住 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const PI = Math.PI;
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.diorama && window.diorama.scene, null, { timeout: 120000 });
  await pg.waitForTimeout(9000);
  const hideUI = () => pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('进入展厅'));
    if (btn) { let el = btn; for (let i = 0; i < 7 && el; i++) { el = el.parentElement; if (el && getComputedStyle(el).position === 'fixed') { el.style.display = 'none'; break; } } }
    document.querySelectorAll('#toast,.toast').forEach(e => e.style.display = 'none');
  });
  await hideUI();
  await pg.evaluate(() => window.diorama.walk(true));
  await pg.waitForTimeout(1200);
  /* yaw: 0=北(-z)  -PI/2=东(+x)  PI/2=西(-x)   pitch>0 抬头 */
  const shots = [
    ['road_north', [0, 15.4], 0, 0.0],
    ['road_westside', [-24, 15.4], 0, 0.0],
    ['road_west', [0, 15.4], PI / 2, 0.0],
    ['road_east', [0, 15.4], -PI / 2, 0.0]
  ];
  for (const [name, [x, z], yaw, pitch] of shots) {
    const r = await pg.evaluate(([X, Z, Y, P]) => {
      window.diorama.fp.set(X, 0.26, Z, Y, P);
      return window.diorama.fp.get();
    }, [x, z, yaw, pitch]);
    await pg.waitForTimeout(2600);
    await hideUI();
    await pg.waitForTimeout(400);
    await pg.screenshot({ path: '/tmp/w_' + name + '.png' });
    console.log('SHOT /tmp/w_' + name + '.png ' + JSON.stringify(r));
  }
  console.log(errs.length ? 'ERRORS ' + errs.slice(0, 3).join(' | ') : 'no page errors');
  await b.close();
})();
