/* 小物件结构分析 + Group 级距离剔除模拟（2026-11-26）
   1) 场景里 radius<=1.5m 的 Group 有多少、里面装了什么
   2) 按 Group 整体隐藏（能顺带处理 InstancedMesh）能换多少 fps
   用法： node probe_smallgroups.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

const VIEWS = [
  ['正门广场', [0, 2.2, 2, 0, 3.2, 8]],
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
  await pg.waitForTimeout(9000);

  const struct = await pg.evaluate(() => {
    const T = window.XM_TOUR, THREE = T.THREE;
    const box = new THREE.Box3();
    const cands = [];
    T.scene.traverse(o => {
      if (!o.isGroup) return;
      box.setFromObject(o);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const rad = Math.max(size.x, size.y, size.z) / 2;
      if (rad > 1.6) return;
      let meshes = 0, inst = 0, tris = 0;
      o.traverse(m => {
        if (!m.isMesh) return;
        meshes++;
        if (m.isInstancedMesh) inst++;
        const g = m.geometry;
        if (g && g.attributes.position) tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (m.isInstancedMesh ? m.count : 1);
      });
      if (!meshes) return;
      const c = box.getCenter(new THREE.Vector3());
      let chain = [], p = o;
      for (let i = 0; i < 3 && p; i++) { chain.push((p.userData && p.userData.tag) || p.name || p.type); p = p.parent; }
      cands.push({ o, rad, meshes, inst, tris, c, chain: chain.join('<') });
    });
    // 按 (网格数, 三角形) 归类
    const byShape = new Map();
    cands.forEach(c => {
      const k = c.meshes + 'mesh/' + (c.inst ? '有实例' : '无实例') + '/' + Math.round(c.tris) + '面';
      byShape.set(k, (byShape.get(k) || 0) + 1);
    });
    return {
      n: cands.length,
      totalMeshes: cands.reduce((a, c) => a + c.meshes, 0),
      totalTris: cands.reduce((a, c) => a + c.tris, 0),
      shapes: [...byShape.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
      sample: cands.slice(0, 10).map(c => `${c.meshes}mesh ${c.tris}面 r=${c.rad.toFixed(2)} ${c.chain}`)
    };
  });
  console.log(`=== 小 Group（半径≤1.6m）共 ${struct.n} 个，内含 ${struct.totalMeshes} 个 mesh / ${struct.totalTris} 面 ===`);
  struct.shapes.forEach(([k, v]) => console.log(`  ${String(v).padStart(5)} 个  ${k}`));
  console.log('  样例:'); struct.sample.forEach(s => console.log('    ' + s));

  const measure = async () => pg.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
      else {
        const T = window.XM_TOUR, i = T.renderer.info.render;
        res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), calls: i.calls, tris: i.tiangle || i.triangles });
      }
    };
    requestAnimationFrame(tick);
  }));

  for (const [name, cam] of VIEWS) {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1200);
    console.log(`\n=== ${name} ===`);
    for (const D of [0, 20, 30, 40]) {
      await pg.evaluate((D) => {
        const T = window.XM_TOUR;
        if (!window.__sg) {
          window.__sg = [];
          const box = new T.THREE.Box3();
          T.scene.traverse(o => {
            if (!o.isGroup) return;
            box.setFromObject(o);
            if (box.isEmpty()) return;
            const size = box.getSize(new T.THREE.Vector3());
            const rad = Math.max(size.x, size.y, size.z) / 2;
            if (rad > 1.6) return;
            let meshes = 0;
            o.traverse(m => { if (m.isMesh) meshes++; });
            if (!meshes) return;
            window.__sg.push({ o, c: box.getCenter(new T.THREE.Vector3()) });
          });
        }
        (window.__sgHidden || []).forEach(h => h.o.visible = true);
        window.__sgHidden = [];
        if (D > 0) {
          const c = T.camera.position;
          for (const it of window.__sg) {
            const dx = it.c.x - c.x, dy = it.c.y - c.y, dz = it.c.z - c.z;
            if (dx * dx + dy * dy + dz * dz > D * D) { it.o.visible = false; window.__sgHidden.push(it); }
          }
        }
      }, D);
      await pg.waitForTimeout(700);
      const r = await measure();
      console.log(`  隐藏距离>${String(D).padStart(3)}m 的小 Group   ${String(r.fps).padStart(6)} fps   draw ${String(r.calls).padStart(5)}   三角面 ${String(r.tris).padStart(9)}`);
    }
    await pg.evaluate(() => { (window.__sgHidden || []).forEach(h => h.o.visible = true); });
  }
  await b.close();
})();
