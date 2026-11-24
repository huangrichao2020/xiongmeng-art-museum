/* 精确统计：固定相机下，按视锥剔除后每个顶层组还剩多少 draw call */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.XM.shot('balloon-above'));
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const { scene, camera, renderer } = window.__PROBE;
    const THREE = window.__THREE;
    camera.updateMatrixWorld(true);
    const proj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(proj);
    const m = new THREE.Matrix4(), sph = new THREE.Sphere();
    const rows = [];
    let total = 0, instTotal = 0;
    scene.children.forEach((c, idx) => {
      let vis = 0, inst = 0;
      c.traverse(o => {
        if (!(o.isMesh || o.isPoints || o.isLine)) return;
        // 有效可见性：自身及所有祖先 visible
        let p = o, ok = true;
        while (p) { if (!p.visible) { ok = false; break; } p = p.parent; }
        if (!ok) return;
        if (!o.geometry) return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        sph.copy(o.geometry.boundingSphere);
        m.copy(o.matrixWorld); sph.applyMatrix4(m);
        if (!frustum.intersectsSphere(sph)) return;
        if (o.isInstancedMesh) inst++; else vis++;
      });
      total += vis; instTotal += inst;
      if (vis + inst > 3) rows.push({ idx, tag: (c.userData && c.userData.tag) || c.name || ('Group:' + idx), vis, inst, cost: vis + inst });
    });
    rows.sort((a, b2) => b2.cost - a.cost);
    return { total, instTotal, real: renderer.info.render.calls, rows: rows.slice(0, 24) };
  });
  console.log('视锥内可见 mesh 合计 =', r.total, ' instanced =', r.instTotal, ' 实际 calls =', r.real);
  r.rows.forEach(g => console.log('  ', String(g.cost).padStart(5), ' mesh=' + String(g.vis).padStart(5), 'inst=' + String(g.inst).padStart(3), ' ', g.tag));
  await b.close();
})();
