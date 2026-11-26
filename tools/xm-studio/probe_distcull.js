/* 按距离剔除小物件 A/B（2026-11-26）
   「藏掉半径<1m 的小件」能让正门广场直接回到 60fps，
   但不能全藏（熊和摆件是场景的魂），只能「远处的藏、近处的留」。
   这里量不同距离阈值下的 fps / draw / 三角面。

   用法： node probe_distcull.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

const VIEWS = [
  ['正门广场', [0, 2.2, 2, 0, 3.2, 8]],
  ['市集西列', [-30, 2.0, -4, -36, 1.6, -12]],
  ['公交站', [-30, 2.0, 15, -29.5, 2.2, 9.5]],
  ['全景俯视', [0, 150, 70, 0, 0, 0]]
];

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
  });
  await pg.waitForTimeout(8000);

  const measure = async () => pg.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
      else {
        const T = window.XM_TOUR, i = T.renderer.info.render;
        res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), calls: i.calls, tris: i.triangles });
      }
    };
    requestAnimationFrame(tick);
  }));

  for (const [name, cam] of VIEWS) {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1200);
    console.log(`\n=== ${name} ===`);
    for (const D of [0, 18, 25, 35, 45, 60]) {
      await pg.evaluate((D) => {
        const T = window.XM_TOUR;
        if (!window.__dc) {
          window.__dc = [];
          T.scene.traverse(o => {
            if (!o.isMesh || !o.geometry) return;
            if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            const sc = o.getWorldScale(new T.THREE.Vector3());
            const rad = o.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
            if (rad < 1.0) window.__dc.push({ o, r: rad, p: o.getWorldPosition(new T.THREE.Vector3()) });
          });
        }
        window.__dcHidden = window.__dcHidden || [];
        window.__dcHidden.forEach(h => h.o.visible = true);
        window.__dcHidden = [];
        if (D > 0) {
          const c = T.camera.position;
          for (const it of window.__dc) {
            const dx = it.p.x - c.x, dy = it.p.y - c.y, dz = it.p.z - c.z;
            if (dx * dx + dy * dy + dz * dz > D * D) { it.o.visible = false; window.__dcHidden.push(it); }
          }
        }
      }, D);
      await pg.waitForTimeout(700);
      const r = await measure();
      console.log(`  剔除半径<1m 且 距离>${String(D).padStart(3)}m   ${String(r.fps).padStart(6)} fps   draw ${String(r.calls).padStart(5)}   三角面 ${String(r.tris).padStart(9)}`);
    }
    await pg.evaluate(() => { (window.__dcHidden || []).forEach(h => h.o.visible = true); });
  }
  await b.close();
})();
