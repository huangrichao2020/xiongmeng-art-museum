/* 正门广场 A/B：42fps 到底耗在哪（2026-11-26）
   逐项关掉可疑开销，量帧率变化：
     降渲染分辨率 / 关点光源 / 关阴影 / 藏掉小熊 NPC / 藏掉博物馆内部
   用法： node probe_plaza_ab.js
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
  await pg.waitForTimeout(10000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    window.XM_TOUR.stopDirector();
    window.MP.freezeCam(0, 2.2, 2, 0, 3.2, 8);
  });
  await pg.waitForTimeout(1500);

  const measure = async (label) => {
    const r = await pg.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
        else {
          const T = window.XM_TOUR, i = T.renderer.info.render;
          const TT = window.XM_TOUR;
          res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), calls: i.calls, tris: i.triangles,
                cam: [TT.camera.position.x, TT.camera.position.y, TT.camera.position.z].map(v=>+v.toFixed(1)) });
        }
      };
      requestAnimationFrame(tick);
    }));
    console.log(label.padEnd(24), String(r.fps).padStart(6), 'fps   draw', String(r.calls).padStart(5), '  三角面', String(r.tris).padStart(9), '  相机', r.cam.join(','));
    return r;
  };

  console.log('=== 正门广场 (0,2.2,2) → (0,3.2,8) ===');
  await measure('基线');

  const dpr0 = await pg.evaluate(() => window.XM_TOUR.renderer.getPixelRatio());
  await pg.evaluate(() => window.XM_TOUR.dpr(0.6));
  await pg.waitForTimeout(1200);
  await measure('渲染分辨率 0.6x');
  await pg.evaluate(d => window.XM_TOUR.dpr(d), dpr0);
  await pg.waitForTimeout(1200);
  await measure('恢复分辨率');

  await pg.evaluate(() => {
    window.__pl = []; window.XM_TOUR.scene.traverse(o => {
      if (o.isPointLight) { window.__pl.push([o, o.intensity, o.visible]); o.intensity = 0; o.visible = false; }
    });
  });
  await pg.waitForTimeout(1500);
  await measure('关全部点光源');
  await pg.evaluate(() => { window.__pl.forEach(([o, v, vis]) => { o.intensity = v; o.visible = vis; }); });
  await pg.waitForTimeout(1500);
  await measure('恢复点光源');

  await pg.evaluate(() => { window.XM_TOUR.renderer.shadowMap.enabled = false; window.XM_TOUR.scene.traverse(o => { if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.needsUpdate = true); else o.material.needsUpdate = true; } }); });
  await pg.waitForTimeout(1500);
  await measure('关阴影');
  await pg.evaluate(() => { window.XM_TOUR.renderer.shadowMap.enabled = true; });

  // 藏掉半径小的 mesh（模拟「小物件不画」）
  await pg.evaluate(() => {
    window.__hid = [];
    const T = window.XM_TOUR;
    T.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const sc = o.getWorldScale(new T.THREE.Vector3());
      const rad = o.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
      if (rad < 1.0) { window.__hid.push(o); o.visible = false; }
    });
  });
  await pg.waitForTimeout(1200);
  await measure('藏掉半径<1m 的小件');
  await pg.evaluate(() => { window.__hid.forEach(o => o.visible = true); });

  await b.close();
})();
