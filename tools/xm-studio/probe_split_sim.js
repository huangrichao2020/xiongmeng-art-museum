/* 「按空间格子拆分大 mesh」的收益模拟（2026-11-26）
   现状：静态合批把整组几何并成一个大 mesh，包围半径 68~242m，
         视锥剔除对它们完全失效 → 站马路上也在画全城。
   假设把半径大的 mesh 按空间格子拆开，估算能少画多少三角面。

   用法： node probe_split_sim.js [机位序号]
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
  });
  await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
  await pg.waitForTimeout(1500);

  const r = await pg.evaluate(() => {
    const T = window.XM_TOUR, THREE = T.THREE;
    const cam = T.camera; cam.updateMatrixWorld(true);
    const proj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const fr = new THREE.Frustum().setFromProjectionMatrix(proj);
    let cur = 0, splitEst = 0, bigCount = 0, bigTris = 0, splitCount = 0;
    const a = new THREE.Vector3(), bb = new THREE.Vector3(), c = new THREE.Vector3();
    T.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry; if (!g || !g.attributes.position) return;
      const pos = g.attributes.position;
      const idxArr = g.index ? g.index.array : null;
      const tris = (idxArr ? idxArr.length : pos.count) / 3;
      const inst = o.isInstancedMesh ? o.count : 1;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const ctr = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      const sc = o.getWorldScale(new THREE.Vector3());
      const rad = g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
      if (!fr.intersectsSphere(new THREE.Sphere(ctr, rad))) return;
      cur += tris * inst;
      if (rad <= 20) { splitEst += tris * inst; return; }
      // 大 mesh：抽样估「在视锥内的比例」
      bigCount++; bigTris += tris * inst;
      const step = Math.max(1, Math.floor(tris / 400));
      let hit = 0, tot = 0;
      const m = o.matrixWorld;
      for (let t = 0; t < tris; t += step) {
        const i0 = idxArr ? idxArr[t * 3] : t * 3, i1 = idxArr ? idxArr[t * 3 + 1] : t * 3 + 1, i2 = idxArr ? idxArr[t * 3 + 2] : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m);
        bb.fromBufferAttribute(pos, i1).applyMatrix4(m);
        c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        const cx = (a.x + bb.x + c.x) / 3, cy = (a.y + bb.y + c.y) / 3, cz = (a.z + bb.z + c.z) / 3;
        const d = new THREE.Vector3(cx, cy, cz);
        tot++;
        if (fr.containsPoint(d)) hit++;
      }
      const frac = tot ? hit / tot : 1;
      splitEst += tris * inst * frac;
      // 拆成格子后大致会变成几块：按格子边长 14m 估
      const cell = 14;
      const cells = new Set();
      for (let t = 0; t < tris; t += step) {
        const i0 = idxArr ? idxArr[t * 3] : t * 3, i1 = idxArr ? idxArr[t * 3 + 1] : t * 3 + 1, i2 = idxArr ? idxArr[t * 3 + 2] : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m);
        bb.fromBufferAttribute(pos, i1).applyMatrix4(m);
        c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        cells.add([Math.floor((a.x + bb.x + c.x) / 3 / cell), Math.floor((a.y + bb.y + c.y) / 3 / cell), Math.floor((a.z + bb.z + c.z) / 3 / cell)].join(','));
      }
      splitCount += cells.size;
    });
    return { cur, splitEst, bigCount, bigTris, splitCount };
  });

  console.log(`=== ${name} ===`);
  console.log(`  现在要画的三角面        ${r.cur}`);
  console.log(`  拆格后预计要画          ${Math.round(r.splitEst)}   （省 ${(100 - r.splitEst / r.cur * 100).toFixed(0)}%）`);
  console.log(`  半径>20m 的大 mesh      ${r.bigCount} 个，合计 ${r.bigTris} 面`);
  console.log(`  这些拆开后约变成        ${r.splitCount} 个小 mesh（draw call 增量）`);

  await b.close();
})();
