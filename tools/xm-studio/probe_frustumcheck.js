/* 视锥统计 vs renderer 对账（2026-11-26）
   probe_tris_view 说广场只有 101 个 mesh 在视锥里，renderer 却画 1700+ 个 —— 必须对账。
   这里：直接调 renderer.render(scene,camera)（绕开 composer），前后取 info，
   再和手工算的视锥内 mesh 数比对。
   用法： node probe_frustumcheck.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
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
  await pg.waitForTimeout(8000);

  const r = await pg.evaluate(() => {
    const T = window.XM_TOUR, THREE = T.THREE;
    const cam = T.camera;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const proj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const fr = new THREE.Frustum().setFromProjectionMatrix(proj);

    let total = 0, inFrustum = 0, noCull = 0, casters = 0;
    const culled = [], kept = [];
    T.scene.traverse(o => {
      if (!o.isMesh) return;
      let vis = o.visible, q = o.parent;
      while (vis && q) { vis = q.visible; q = q.parent; }
      if (!vis) return;
      total++;
      const g = o.geometry; if (!g || !g.attributes.position) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const ctr = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      const sc = o.getWorldScale(new THREE.Vector3());
      const rad = g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
      const hit = fr.intersectsSphere(new THREE.Sphere(ctr, rad));
      if (hit) inFrustum++;
      if (!o.frustumCulled) noCull++;
      if (o.castShadow) casters++;
      const tag = ((o.userData && o.userData.tag) || o.name || o.type) + '@' + [ctr.x.toFixed(0), ctr.y.toFixed(0), ctr.z.toFixed(0)].join(',');
      (hit ? kept : culled).push(tag + ' r' + rad.toFixed(0));
    });

    // 直接渲一帧场景，量真实 draw call
    T.renderer.info.autoReset = false;
    T.renderer.info.reset();
    T.renderer.render(T.scene, cam);
    const sceneOnly = { calls: T.renderer.info.render.calls, tris: T.renderer.info.render.triangles };

    // 关阴影再渲一帧
    const wasShadow = T.renderer.shadowMap.enabled;
    T.renderer.shadowMap.enabled = false;
    T.renderer.info.reset();
    T.renderer.render(T.scene, cam);
    const noShadow = { calls: T.renderer.info.render.calls, tris: T.renderer.info.render.triangles };
    T.renderer.shadowMap.enabled = wasShadow;
    T.renderer.info.autoReset = true;

    return {
      cam: { pos: cam.position.toArray().map(v => +v.toFixed(1)), dir: dir.toArray().map(v => +v.toFixed(2)), fov: cam.fov, far: cam.far },
      total, inFrustum, noCull, casters, sceneOnly, noShadow,
      kept: kept.slice(0, 10), culled: culled.slice(0, 10),
      keptN: kept.length, culledN: culled.length
    };
  });

  console.log('相机', JSON.stringify(r.cam));
  console.log(`可见 mesh 总数 ${r.total}｜视锥内 ${r.inFrustum}｜视锥外 ${r.culledN}｜frustumCulled=false ${r.noCull}｜投影体 ${r.casters}`);
  console.log(`renderer.render(场景) = ${r.sceneOnly.calls} call / ${r.sceneOnly.tris} 面`);
  console.log(`关阴影后同一帧        = ${r.noShadow.calls} call / ${r.noShadow.tris} 面`);
  console.log('视锥内样例:', r.kept.join(' | '));
  console.log('视锥外样例:', r.culled.join(' | '));
  await b.close();
})();
