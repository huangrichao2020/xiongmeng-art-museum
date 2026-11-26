/* 「大块几何周期性出现」体检（2026-11-26）
   同机位下渲染三角面在 87万~172万 之间跳，找出哪些物件在出现/消失。
   用法： node probe_swing.js [秒数]
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const secs = +(process.argv[2] || 26);
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    window.XM_TOUR.stopDirector();
    window.MP.freezeCam(0, 2.2, 2, 0, 3.2, 8);
  });
  await pg.waitForTimeout(6000);

  const snap = () => pg.evaluate(() => {
    const T = window.XM_TOUR, THREE = T.THREE;
    const cam = T.camera; cam.updateMatrixWorld(true);
    const proj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const fr = new THREE.Frustum().setFromProjectionMatrix(proj);
    const map = new Map();
    T.scene.traverse(o => {
      if (!o.isMesh) return;
      let vis = o.visible, q = o.parent;
      while (vis && q) { vis = q.visible; q = q.parent; }
      if (!vis) return;
      const g = o.geometry; if (!g || !g.attributes.position) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const ctr = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      const sc = o.getWorldScale(new THREE.Vector3());
      const rad = g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
      if (!fr.intersectsSphere(new THREE.Sphere(ctr, rad))) return;
      const tris = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
      let chain = [], p = o;
      for (let i = 0; i < 5 && p; i++) { chain.push((p.userData && p.userData.tag) || p.name || p.type); p = p.parent; }
      map.set(o.id, { n: tris, chain: chain.join('<'), ctr: [ctr.x.toFixed(0), ctr.y.toFixed(0), ctr.z.toFixed(0)].join(',') });
    });
    const out=[]; map.forEach((v,k)=>out.push([k,v]));
    return { list: out, total: T.renderer.info.render.triangles, calls: T.renderer.info.render.calls };
  });

  const samples = [];
  for (let i = 0; i < secs; i++) {
    const s = await snap();
    let sum = 0; s.list.forEach(([,v]) => sum += v.n);
    const mm = new Map(s.list);
    samples.push({ total: s.total, calls: s.calls, map: mm });
    console.log(String(i).padStart(3) + 's  渲染面', String(s.total).padStart(9), ' draw', String(s.calls).padStart(5), ' 视锥内估算面', String(sum).padStart(9), ' 视锥内 mesh', String(s.list.length).padStart(5));
    await pg.waitForTimeout(1000);
  }
  // 找面数最高和最低的样本
  let hi = samples[0], lo = samples[0];
  samples.forEach(s => { if (s.total > hi.total) hi = s; if (s.total < lo.total) lo = s; });
  console.log(`\n最高 ${hi.total} vs 最低 ${lo.total}`);
  const added = [], removed = [];
  hi.map.forEach((v, k) => { if (!lo.map.has(k)) added.push([k, v]); });
  lo.map.forEach((v, k) => { if (!hi.map.has(k)) removed.push([k, v]); });
  console.log(`\n=== 只在高帧出现的物件（${added.length} 个）===`);
  added.sort((a, b) => b[1].n - a[1].n).slice(0, 12).forEach(([k, v]) => console.log(`  ${String(v.n).padStart(8)} 面 @${v.ctr}  ${v.chain}`));
  console.log(`\n=== 只在低帧出现的物件（${removed.length} 个）===`);
  removed.sort((a, b) => b[1].n - a[1].n).slice(0, 12).forEach(([k, v]) => console.log(`  ${String(v.n).padStart(8)} 面 @${v.ctr}  ${v.chain}`));
  await b.close();
})();
