/* 定向探测若干候选点的净空半径 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const PTS = [
  [-16, 14], [-18, 14], [-16, 16], [-20, 16], [-14, 16], [-16, 12], [-18, 12],
  [-24, 16], [-22, 14], [-20, 18], [-14, 20], [-16, 22], [-18, 18], [-12, 16],
  [-2, 21], [-2, 22], [-6, 20], [-8, 22]
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);

  const res = await pg.evaluate((pts) => {
    const { THREE, scene } = window.XM_TOUR;
    const ray = new THREE.Raycaster();
    const targets = [], grounds = [];
    scene.traverse(o => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const sz = o.geometry.boundingBox.getSize(new THREE.Vector3());
      if (sz.x > 300 && sz.z > 300 && sz.y < 1) { grounds.push(o); return; }
      if (sz.y < 0.35) return;
      targets.push(o);
    });
    const DIRS = [];
    for (let i = 0; i < 12; i++) DIRS.push(new THREE.Vector3(Math.cos(i * Math.PI / 6), 0, Math.sin(i * Math.PI / 6)));
    return pts.map(([x, z]) => {
      let mn = 99, who = '';
      for (const d of DIRS) {
        ray.set(new THREE.Vector3(x, 1.2, z), d); ray.far = 40;
        const h = ray.intersectObjects(targets, false);
        if (h.length && h[0].distance < mn) {
          mn = h[0].distance;
          const o = h[0].object, sz = o.geometry.boundingBox.getSize(new THREE.Vector3());
          who = (o.userData && o.userData.tag) || o.name || 'x';
          who += `(${sz.x.toFixed(1)}x${sz.y.toFixed(1)}x${sz.z.toFixed(1)})`;
        }
      }
      const g = new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
      const hh = g.intersectObjects(grounds.concat(targets), false);
      const gy = hh.length ? +hh[0].point.y.toFixed(2) : null;
      return { x, z, r: +mn.toFixed(1), who, gy };
    });
  }, PTS);
  for (const r of res) console.log(`x=${String(r.x).padStart(4)} z=${String(r.z).padStart(4)}  净空=${String(r.r).padStart(5)}m  地面y=${r.gy}  最近=${r.who}`);
  await b.close();
})();
