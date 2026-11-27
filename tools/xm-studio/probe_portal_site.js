/* 主站传送门选址：向下打射线，列出每个点上除了地面以外还有什么 */
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
    const down = new THREE.Vector3(0, -1, 0);
    const targets = [];
    scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry;
      if (!g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      const sz = g.boundingBox.getSize(new THREE.Vector3());
      // 400x400 的地平面排除掉
      if (sz.x > 300 && sz.z > 300 && sz.y < 1) return;
      targets.push(o);
    });
    const probe = (x, z) => {
      ray.set(new THREE.Vector3(x, 40, z), down);
      const hits = ray.intersectObjects(targets, false);
      const names = [];
      for (const h of hits) {
        const o = h.object;
        const g = o.geometry, sz = g.boundingBox.getSize(new THREE.Vector3());
        const col = o.material && o.material.color ? '#' + o.material.color.getHexString() : '-';
        const tag = (o.userData && o.userData.tag) || '';
        names.push(`${tag || o.name || 'x'}[${col}] ${sz.x.toFixed(1)}x${sz.y.toFixed(1)}x${sz.z.toFixed(1)} y=${h.point.y.toFixed(2)}`);
        if (names.length >= 4) break;
      }
      return names;
    };
    const out = [];
    for (let x = -30; x <= 30; x += 10) {
      for (let z = -40; z <= 20; z += 10) {
        const n = probe(x, z);
        // 空 = 命中的东西都很矮（< 0.6m 高的薄层/雪/草）
        const clean = n.length === 0 || n.every(s => {
          const m = /\[(\w+)\] ([\d.]+)x([\d.]+)x([\d.]+)/.exec(s);
          return m && parseFloat(m[3]) < 0.6;
        });
        out.push([x, z, clean ? 'CLEAN' : '', n.join(' | ') || '(全空)']);
      }
    }
    return out;
  });
  console.log('空地候选:');
  for (const r of res) console.log('  x=' + r[0], 'z=' + r[1], r[2], '→', r[3]);
  await b.close();
})();
