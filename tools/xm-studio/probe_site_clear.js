/* 主站传送门选址：算每个点的"净空半径"（8 方向水平射线到最近遮挡的距离） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);

  const res = await pg.evaluate(() => {
    const { THREE, scene } = window.XM_TOUR;
    const ray = new THREE.Raycaster();
    const targets = [];
    const grounds = [];
    scene.traverse(o => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const sz = o.geometry.boundingBox.getSize(new THREE.Vector3());
      if (sz.x > 300 && sz.z > 300 && sz.y < 1) { grounds.push(o); return; }
      if (sz.y < 0.35) return;
      targets.push(o);
    });
    const DIRS = [];
    for (let i = 0; i < 8; i++) DIRS.push(new THREE.Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)));
    const freeRadius = (x, z, y) => {
      let mn = 99;
      for (const d of DIRS) {
        ray.set(new THREE.Vector3(x, y, z), d);
        ray.far = 40;
        const h = ray.intersectObjects(targets, false);
        const dd = h.length ? h[0].distance : 40;
        if (dd < mn) mn = dd;
      }
      return mn;
    };
    const out = [];
    for (let x = -80; x <= 80; x += 4) {
      for (let z = -60; z <= 70; z += 4) {
        const r = freeRadius(x, z, 1.2);
        if (r >= 6) {
          const ground = (() => {
            const g = new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
            const hh = g.intersectObjects(grounds.concat(targets), false);
            return hh.length ? +hh[0].point.y.toFixed(2) : null;
          })();
          out.push([x, z, +r.toFixed(1), ground]);
        }
      }
    }
    return out;
  });
  console.log('净空半径 ≥6m 的点 (x, z, 半径, 地面y):');
  for (const r of res) console.log('  ', r.join('  '));
  await b.close();
})();
