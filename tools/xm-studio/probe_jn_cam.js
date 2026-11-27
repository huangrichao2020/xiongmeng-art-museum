/* 江南古村 · 近观机位扫描：一次加载，多组参数截图对比
   用法：node probe_jn_cam.js [seed] */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const SEED = process.argv[2] || '4099461353';

/* s: 沿主路轴相对端点的偏移（正=往村内），h: 机位高，
   d: 目标沿轴距离，th: 目标高，fov: 视场角 */
const CAMS = [
  { id: 'K', s: 20, h: 6.5, d: 42, th: 3.2, fov: 54 },
  { id: 'L', s: 20, h: 7.5, d: 45, th: 2.5, fov: 52 },
  { id: 'M', s: 18, h: 5.5, d: 38, th: 3.5, fov: 56 },
  { id: 'N', s: 24, h: 8.0, d: 50, th: 1.0, fov: 50 },
  { id: 'O', s: 22, h: 9.0, d: 46, th: 0.5, fov: 50 },
  { id: 'P', s: 26, h: 11.0, d: 55, th: 0.0, fov: 48 }
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 690 } })).newPage();
  await pg.goto(`http://127.0.0.1:8900/?seed=${SEED}`, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.__jnReady === true, null, { timeout: 180000 });
  await pg.waitForTimeout(1200);

  const geo = await pg.evaluate(() => {
    const L = window.__jnLayout;
    const main = L.roads.find(r => r.kind === 'main') || L.roads[0];
    const cx = (main.x1 + main.x2) / 2, cz = (main.z1 + main.z2) / 2;
    const ends = [{ x: main.x1, z: main.z1 }, { x: main.x2, z: main.z2 }];
    let end = null;
    if (L.paifangs && L.paifangs.length) {
      let best = null, bd = Infinity;
      for (const e of ends) for (const p of L.paifangs) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (bd < 40) end = best;
    }
    if (!end) end = Math.hypot(ends[0].x - cx, ends[0].z - cz) > Math.hypot(ends[1].x - cx, ends[1].z - cz) ? ends[0] : ends[1];
    let dx = cx - end.x, dz = cz - end.z;
    const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
    const pf = (L.paifangs || []).map(p => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), kind: p.kind }));
    return { end: { x: +end.x.toFixed(1), z: +end.z.toFixed(1) }, dx: +dx.toFixed(4), dz: +dz.toFixed(4), paifangs: pf, cx: +cx.toFixed(1), cz: +cz.toFixed(1) };
  });
  console.log('端点', JSON.stringify(geo));

  for (const c of CAMS) {
    await pg.evaluate(({ c, geo }) => {
      const cam = window.__jnCam;
      const g = geo;
      const x = g.end.x + g.dx * c.s, z = g.end.z + g.dz * c.s;
      const tx = x + g.dx * c.d, tz = z + g.dz * c.d;
      cam.position.set(x, c.h, z);
      cam.fov = c.fov; cam.updateProjectionMatrix();
      cam.lookAt(tx, c.th, tz);
      /* 同步 OrbitControls 的 target，否则下一帧被拉回去 */
      if (window.__jnControls) { window.__jnControls.target.set(tx, c.th, tz); window.__jnControls.update(); }
    }, { c, geo });
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: `/tmp/jncam_${c.id}.png` });
    console.log('  →', `/tmp/jncam_${c.id}.png`, JSON.stringify(c));
  }
  await b.close();
})();
