/* 主站传送门最终选址：只算实体障碍（高 ≥0.8m）的净空半径，
   在艺术馆门口 40m 内找最大净空点 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);

  const res = await pg.evaluate(() => {
    const { THREE, scene } = window.XM_TOUR;
    const ray = new THREE.Raycaster();
    const solids = [], flats = [];
    scene.traverse(o => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const sz = o.geometry.boundingBox.getSize(new THREE.Vector3());
      if (sz.x > 300 && sz.z > 300 && sz.y < 1) return;
      if (sz.y < 0.8) { flats.push(o); return; }
      solids.push(o);
    });
    const DIRS = [];
    for (let i = 0; i < 16; i++) DIRS.push(new THREE.Vector3(Math.cos(i * Math.PI / 8), 0, Math.sin(i * Math.PI / 8)));
    const out = [];
    for (let x = -46; x <= 46; x += 2) {
      for (let z = -22; z <= 26; z += 2) {
        let mn = 99, who = '';
        for (const d of DIRS) {
          ray.set(new THREE.Vector3(x, 1.5, z), d); ray.far = 30;
          const h = ray.intersectObjects(solids, false);
          if (h.length && h[0].distance < mn) {
            mn = h[0].distance;
            const o = h[0].object;
            who = (o.userData && o.userData.tag) || o.name || 'x';
          }
        }
        const distToDoor = Math.hypot(x - 0, z - 10);
        if (mn >= 6) out.push([x, z, +mn.toFixed(1), +distToDoor.toFixed(0), who]);
      }
    }
    return out;
  });
  // 按「离正门近 + 净空大」排前 20
  res.sort((a, b2) => (b2[2] * 2 - b2[3]) - (a[2] * 2 - a[3]));
  console.log('候选 (x, z, 净空m, 离正门m, 最近障碍):');
  for (const r of res.slice(0, 24)) console.log('  ', r.join('  '));
  await b.close();
})();
