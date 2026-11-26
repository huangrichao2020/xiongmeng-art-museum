/* 视锥内三角面体检（2026-11-26）
   手机上 draw call 不多（视锥窄），真正吃性能的是三角面。
   这里在指定机位下，只统计「真的会被画到」的面，找出大户。
   用法： node probe_tris_view.js [机位序号]
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

const VIEWS = {
  0: ['正门广场', [0, 2.2, 2, 0, 3.2, 8]],
  1: ['公交站', [-30, 2.0, 15, -29.5, 2.2, 9.5]],
  2: ['南段马路', [0, 2.2, 12.5, -20, 2.0, 14]],
  3: ['市集西列', [-30, 2.0, -4, -36, 1.6, -12]],
  4: ['喷泉花园', [-16, 2.0, 6, -24.4, 2.0, 0.2]],
  5: ['全景俯视', [0, 150, 70, 0, 0, 0]]
};

(async () => {
  const idx = +(process.argv[2] || 1);
  const [name, cam] = VIEWS[idx] || VIEWS[1];
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui&mobile', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(12000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    window.XM_TOUR.stopDirector();
  });
  await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
  await pg.waitForTimeout(1500);

  const r = await pg.evaluate(() => {
    const T = window.XM_TOUR, THREE = T.THREE;
    const cam = T.camera;
    cam.updateMatrixWorld(true);cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const proj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const fr = new THREE.Frustum().setFromProjectionMatrix(proj);
    const rows = []; let total = 0, smallTotal = 0;
    const v = new THREE.Vector3();
    T.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry; if (!g || !g.attributes.position) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const c = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      const sc = o.getWorldScale(new THREE.Vector3());
      const rad = g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
      if (!fr.intersectsSphere(new THREE.Sphere(c, rad))) return;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const inst = o.isInstancedMesh ? o.count : 1;
      const n = tris * inst; total += n;
      if (rad < 1.2) smallTotal += n;
      let chain = [], q = o;
      for (let i = 0; i < 4 && q; i++) { chain.push((q.userData && q.userData.tag) || q.name || q.type); q = q.parent; }
      rows.push({ n, rad: +rad.toFixed(2), inst, type: g.type, chain: chain.join(' < '), pos: [c.x.toFixed(1), c.y.toFixed(1), c.z.toFixed(1)].join(',') });
    });
    rows.sort((a, b) => b.n - a.n);
    return { total, smallTotal, rows: rows.slice(0, 22), cnt: rows.length };
  });

  console.log(`=== ${name} 视锥内三角面 ${r.total}（${r.cnt} 个 mesh），其中小物件(<1.2m)占 ${r.smallTotal} ===\n`);
  for (const x of r.rows) console.log(`  ${String(x.n).padStart(8)} 面  半径${String(x.rad).padStart(6)}m  ${String(x.inst).padStart(3)}× ${x.type.padEnd(16)} @${x.pos}  ${x.chain}`);

  await b.close();
})();
