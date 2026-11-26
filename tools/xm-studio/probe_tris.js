/* 三角面大户体检（2026-11-26）
   全景机位 195 万三角面 —— 找出几何面数都花在谁身上。
   用法： node probe_tris.js
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
  await pg.waitForTimeout(12000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    window.MP.freezeCam(0, 150, 70, 0, 0, 0);
  });
  await pg.waitForTimeout(1200);

  const r = await pg.evaluate(() => {
    const T = window.XM_TOUR;
    const rows = [];
    let total = 0;
    T.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry;
      if (!g || !g.attributes.position) return;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const inst = o.isInstancedMesh ? o.count : 1;
      const n = tris * inst;
      total += n;
      const p = o.getWorldPosition(new T.THREE.Vector3());
      let chain = [], q = o;
      for (let i = 0; i < 4 && q; i++) { chain.push((q.userData && q.userData.tag) || q.name || q.type); q = q.parent; }
      rows.push({
        n, tris, inst, type: g.type, chain: chain.join(' < '),
        pos: [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)].join(','),
        mat: (Array.isArray(o.material) ? o.material[0] : o.material) && o.material.color ? '#' + o.material.color.getHexString() : '?',
        geoParams: g.parameters ? JSON.stringify(g.parameters).slice(0, 90) : ''
      });
    });
    rows.sort((a, b) => b.n - a.n);
    // 按材质色汇总（同一色往往是一整类重复件）
    const byColor = new Map();
    rows.forEach(x => { const e = byColor.get(x.mat) || { n: 0, c: 0 }; e.n += x.n; e.c++; byColor.set(x.mat, e); });
    return {
      total, rows: rows.slice(0, 25),
      byColor: [...byColor.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 18),
      meshCount: rows.length
    };
  });

  console.log(`=== 场景三角面合计 ${r.total}（${r.meshCount} 个 mesh）===\n`);
  console.log('=== 单体三角面大户（前 25）===');
  for (const x of r.rows) {
    console.log(`  ${String(x.n).padStart(8)} 面  ${String(x.inst).padStart(3)}× ${x.type.padEnd(16)} ${x.mat} @${x.pos}  ${x.chain}`);
    if (x.geoParams) console.log(`           ${x.geoParams}`);
  }
  console.log('\n=== 按颜色汇总（同一色 = 一类重复件）===');
  for (const [k, v] of r.byColor) console.log(`  ${String(v.n).padStart(9)} 面  ${String(v.c).padStart(4)} 个 mesh  ${k}`);

  await b.close();
})();
