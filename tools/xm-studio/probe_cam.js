/* 鸟巢视觉体检：用 camSet 精确摆位拍三张（东南俯瞰 / 正南 / 鸟巢门口） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const accs = pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + String(e.stack || e).slice(0, 260)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.diorama && window.diorama.scene, null, { timeout: 120000 });
  await pg.evaluate((a) => {
    const A = document.getElementById('mp-acc'), P = document.getElementById('mp-pass');
    if (A && P) { A.value = a; P.value = '123456'; document.getElementById('mp-go').click(); }
  }, accs.a);
  await pg.waitForTimeout(12000);
  const hideUI = () => pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('进入展厅'));
    if (btn) { let el = btn; for (let i = 0; i < 7 && el; i++) { el = el.parentElement; if (el && getComputedStyle(el).position === 'fixed') { el.style.display = 'none'; break; } } }
    document.querySelectorAll('#toast,.toast').forEach(e => e.style.display = 'none');
  });
  await hideUI();
  const shots = [
    ['box', [6.0, 3.2, 26.5], [5.88, 3.5, 20.95], 42],
    ['box2', [9.5, 4.2, 25.0], [5.88, 3.4, 20.95], 44],
    ['nest', [-46, 26, -86], [-46, 8, -112], 46]
  ];
  for (const [name, pos, tgt, fov] of shots) {
    const r = await pg.evaluate(([p, t, f]) => {
      const set = window.diorama.camSet(p, t, f);
      return { set, cam: window.diorama.cam(),
        proj: window.diorama.camProject([
          ['鸟巢中心', -46, 9, -112], ['鸟巢顶口', -46, 17.6, -112], ['鸟巢西缘', -68, 9, -112],
          ['鸟巢南缘', -46, 9, -95], ['体育馆', 32, 7, -104], ['图书馆', 0, 16, -74],
          ['游泳馆', 30, 6, -121], ['主轴北端', 0, 2, -119]
        ]) };
    }, [pos, tgt, fov]);
    console.log('PROBE ' + JSON.stringify(r));
    await pg.waitForTimeout(2200);
    await hideUI();
    await pg.waitForTimeout(400);
    await pg.screenshot({ path: '/tmp/v_' + name + '.png' });
    console.log('SHOT /tmp/v_' + name + '.png ' + JSON.stringify(r));
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 6).join('\n') : 'no page errors');
  await b.close();
})();
