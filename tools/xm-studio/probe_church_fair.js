/* 教堂恢复 + 鸟巢椭圆朝向 + 游乐园地面马路 三项核查 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 260)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE:' + m.text().slice(0, 180)); });
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(12000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  });
  await pg.waitForTimeout(1200);

  const r = await pg.evaluate(() => {
    const sc = window.diorama.scene();
    const mkV = (x, y, z) => { const o = sc.position.clone(); o.set(x, y, z); return o; };
    const bbOf = (o) => {
      const B = { minX: 1e9, minY: 1e9, minZ: 1e9, maxX: -1e9, maxY: -1e9, maxZ: -1e9 };
      o.traverse(c => {
        if (!c.isMesh) return;
        if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
        const bb = c.geometry.boundingBox, e = c.matrixWorld.elements;
        for (const q of [[bb.min.x, bb.min.y, bb.min.z], [bb.max.x, bb.max.y, bb.max.z], [bb.min.x, bb.max.y, bb.min.z], [bb.max.x, bb.min.y, bb.max.z]]) {
          const x = e[0] * q[0] + e[4] * q[1] + e[8] * q[2] + e[12];
          const y = e[1] * q[0] + e[5] * q[1] + e[9] * q[2] + e[13];
          const z = e[2] * q[0] + e[6] * q[1] + e[10] * q[2] + e[14];
          B.minX = Math.min(B.minX, x); B.maxX = Math.max(B.maxX, x);
          B.minY = Math.min(B.minY, y); B.maxY = Math.max(B.maxY, y);
          B.minZ = Math.min(B.minZ, z); B.maxZ = Math.max(B.maxZ, z);
        }
      });
      return B.minY > 1e8 ? null : B;
    };
    const out = { churches: [], bigClock: null };
    sc.traverse(o => {
      if (!o.isGroup) return;
      const p = mkV(0, 0, 0); o.getWorldPosition(p);
      if (Math.abs(p.x + 49) < 3 && Math.abs(p.z - 32) < 6) {
        const B = bbOf(o);
        if (B) out.churches.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), w: +(B.maxX - B.minX).toFixed(1), d: +(B.maxZ - B.minZ).toFixed(1), h: +(B.maxY - B.minY).toFixed(1), top: +B.maxY.toFixed(1) });
      }
    });
    out.clockHands = (window.MP && window.MP.diorama && window.MP.diorama.clock) ? 'ok' : 'n/a';
    return out;
  });
  console.log('页面错误:', errs.length, errs.slice(0, 3));
  console.log('教堂对象:', JSON.stringify(r.churches));

  const shots = [
    ['gate', [0, 10, -20], [0, 6, -54]],
    ['road75', [0, 30, 110], [0, 0, 70]],
    ['bumper', [7, 9, 62], [7, 0, 45]],
    ['nest', [46, 26, -44], [0, 12, -100]]
  ];
  for (const [name, pos, tgt] of shots) {
    await pg.evaluate(([p, t]) => { window.MP.freezeCam(p[0], p[1], p[2], t[0], t[1], t[2]); }, [pos, tgt]);
    await pg.waitForTimeout(2200);
    await pg.screenshot({ path: '/tmp/nv3_' + name + '.png' });
  }
  console.log('截图: /tmp/nv3_nest.png / nv3_church.png / nv3_fair.png / nv3_fair2.png');
  await b.close();
})();
