/* 游乐场经济系统核查：钱包 / 上车光点 / 三个打工位 / 无报错 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE:' + m.text().slice(0, 200)); });
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama && window.ECON, null, { timeout: 180000 });
  await pg.waitForTimeout(13000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  });
  await pg.waitForTimeout(1000);

  const r = await pg.evaluate(() => {
    const sc = window.diorama.scene();
    const out = { coin: window.ECON.coin, pads: window.ECON_RIDES.length, jobs: window.ECON_JOBS.length, signs: 0, padObjs: 0 };
    sc.traverse(o => {
      if (o.isSprite && o.material && o.material.map && o.scale.x > 2.5) out.signs++;
    });
    /* 检查每个上车点位置附近有没有实体（有没有被别的建筑压住） */
    const near = window.ECON_RIDES.map(R => {
      let n = 0;
      sc.traverse(o => {
        if (!o.isMesh) return;
        const p = new (o.position.constructor)(); o.getWorldPosition(p);
        if (Math.hypot(p.x - R.x, p.z - R.z) < 1.2 && p.y < 6) n++;
      });
      return { id: R.id, x: R.x, z: R.z, price: R.price, near: n };
    });
    out.near = near;
    /* 三个打工位附近有没有东西 */
    out.jobNear = window.ECON_JOBS.map(J => {
      let n = 0;
      sc.traverse(o => {
        if (!o.isMesh) return;
        const p = new (o.position.constructor)(); o.getWorldPosition(p);
        if (Math.hypot(p.x - J.gx, p.z - J.gz) < 1.0 && p.y < 6) n++;
      });
      return { id: J.id, gx: J.gx, gz: J.gz, near: n };
    });
    out.walletText = (document.getElementById('w-coin') || {}).textContent;
    return out;
  });
  console.log('页面错误:', errs.length, errs.slice(0, 4));
  console.log('钱包:', r.coin, 'DOM:', r.walletText, '标牌数:', r.signs, '设施:', r.pads, '工位:', r.jobs);
  console.log('上车点:', JSON.stringify(r.near));
  console.log('工位:', JSON.stringify(r.jobNear));

  const shots = [
    ['econ_jobs', [16, 13, 20], [16, 1, 30]],
    ['econ_ticket', [13.6, 3.5, 21.5], [13.6, 1.4, 27.8]],
    ['econ_photo', [19.8, 4.5, 22.5], [19.8, 1.4, 30.0]],
    ['econ_wrap', [12.4, 4.0, 28.5], [12.4, 1.4, 34.8]],
    ['econ_wheelpad', [27, 6, 50], [27, 0.5, 43]],
    ['econ_bumperpad', [-14, 6, 45], [-8, 0.5, 45]],
  ];
  for (const [id, pos, look] of shots) {
    await pg.evaluate(([p, l]) => {
      if (!window.MP) return;
      window.MP.freezeCam(p[0], p[1], p[2], l[0], l[1], l[2]);
    }, [pos, look]);
    await pg.waitForTimeout(2200);
    await pg.screenshot({ path: '/tmp/' + id + '.png' });
    console.log('shot', id);
  }
  await b.close();
})();
