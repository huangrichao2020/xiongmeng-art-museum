/* 主站传送门验收：走到跟前出提示条 + 按 E 跳转 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('[c] ' + String(m.text()).slice(0, 200)); });
  await pg.goto(process.env.JN_URL || 'http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  /* 传送门存在吗 */
  const gate = await pg.evaluate(() => {
    const T = window.XM_TOUR;
    const g = T.scene.getObjectByName('jn-portal');
    if (!g) return null;
    const box = new T.THREE.Box3().setFromObject(g);
    let meshes = 0; g.traverse(o => { if (o.isMesh) meshes++; });
    return {
      pos: g.position.toArray(), meshes,
      box: [box.min.toArray().map(v => +v.toFixed(2)), box.max.toArray().map(v => +v.toFixed(2))]
    };
  });
  console.log('门楼:', JSON.stringify(gate));

  /* 站到跟前（fp 走位） */
  await pg.evaluate(() => { window.diorama.enterWalk(); });
  await pg.waitForTimeout(500);
  await pg.evaluate(() => {
    const fp = window.__fp;
    fp.x = -2; fp.z = 24.4; fp.on = true;   /* 门楼 z=26，门槛半径 r+1.4=4.6 */
  });
  await pg.waitForTimeout(1200);
  const st = await pg.evaluate(() => {
    const h = document.getElementById('train-hud');
    return {
      show: h.classList.contains('show'),
      msg: document.getElementById('train-msg').textContent,
      btn: document.getElementById('train-btn').textContent
    };
  });
  console.log('站到门前提示条:', JSON.stringify(st));

  await pg.screenshot({ path: '/tmp/jn_gate_main.png' });

  /* 走远，提示条应该收掉 */
  await pg.evaluate(() => { window.__fp.x = -2; window.__fp.z = 40; });
  await pg.waitForTimeout(1000);
  const st2 = await pg.evaluate(() => document.getElementById('train-hud').classList.contains('show'));
  console.log('走远后提示条 show =', st2);

  console.log('报错:', errs.length); errs.slice(0, 6).forEach(e => console.log('  ', e));
  await b.close();
})();
