/* 「按空间格子拆大 mesh」收益模拟 v2（2026-11-26）
   v1 的相机是错的（没停导演机位），结论作废，重做。
   这里估算：若静态合批时按 24m 空间格子分桶（而不是整组并成一个大 mesh），
   视锥剔除能重新生效，能少画多少三角面、draw call 会变成多少。

   用法： node probe_split_sim2.js [机位序号] [格子边长]
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
  5: ['鸟巢外环', [30, 2.2, -38, 30, 3.0, -52]],
  6: ['教堂红毯', [-49, 2.0, 24, -49, 4.0, 34]],
  7: ['全景俯视', [0, 150, 70, 0, 0, 0]]
};

(async () => {
  const idx = +(process.argv[2] || 0);
  const CELL = +(process.argv[3] || 24);
  const [name, cam] = VIEWS[idx] || VIEWS[0];
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(10000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    window.XM_TOUR.stopDirector();
  });
  await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
  await pg.waitForTimeout(1500);

  const r = await pg.evaluate((CELL) => {
    const T = window.XM_TOUR, THREE = T.THREE;
    const cam = T.camera; cam.updateMatrixWorld(true);cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const proj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const fr = new THREE.Frustum().setFromProjectionMatrix(proj);
    const buckets = new Map();     // 材质|cast|ro|格子 -> {tris, vis}
    let curTris = 0, curMeshes = 0, visMeshes = 0;
    const a = new THREE.Vector3(), bb = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
    T.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry; if (!g || !g.attributes.position) return;
      const pos = g.attributes.position;
      const ia = g.index ? g.index.array : null;
      const tris = (ia ? ia.length : pos.count) / 3;
      const inst = o.isInstancedMesh ? o.count : 1;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const ctr = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      const sc = o.getWorldScale(new THREE.Vector3());
      const rad = g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
      if (!fr.intersectsSphere(new THREE.Sphere(ctr, rad))) return;
      curMeshes++; curTris += tris * inst;
      if (inst > 1) { visMeshes++; }   // InstancedMesh 不参与拆分估算
      const m = o.matrixWorld;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const mkey = (mat ? mat.uuid : 'x') + '|' + (o.castShadow ? 1 : 0) + '|' + o.renderOrder;
      const step = Math.max(1, Math.floor(tris / 1200));
      for (let t = 0; t < tris; t += step) {
        const i0 = ia ? ia[t * 3] : t * 3, i1 = ia ? ia[t * 3 + 1] : t * 3 + 1, i2 = ia ? ia[t * 3 + 2] : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m);
        bb.fromBufferAttribute(pos, i1).applyMatrix4(m);
        c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        d.set((a.x + bb.x + c.x) / 3, (a.y + bb.y + c.y) / 3, (a.z + bb.z + c.z) / 3);
        const ck = mkey + '|' + Math.floor(d.x / CELL) + ',' + Math.floor(d.y / CELL) + ',' + Math.floor(d.z / CELL);
        let e = buckets.get(ck);
        if (!e) { e = { tris: 0, vis: false }; buckets.set(ck, e); }
        e.tris += (step * inst);
        if (fr.containsPoint(d)) e.vis = true;
      }
    });
    let splitTris = 0, splitCalls = 0;
    for (const e of buckets.values()) if (e.vis) { splitTris += e.tris; splitCalls++; }
    return { curTris, curMeshes, splitTris, splitCalls, buckets: buckets.size };
  }, CELL);

  console.log(`=== ${name}（格子 ${CELL}m）===`);
  console.log(`  现状三角面   ${r.curTris}   可见 mesh ${r.curMeshes}`);
  console.log(`  拆格后三角面 ${Math.round(r.splitTris)}  （省 ${(100 - r.splitTris / r.curTris * 100).toFixed(0)}%）`);
  console.log(`  拆格后 draw  ${r.splitCalls}   （格子桶总数 ${r.buckets}）`);
  await b.close();
})();
