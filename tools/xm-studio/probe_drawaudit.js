/* draw call 来源审计：按顶层分组统计可见 mesh 数量，找出 6000 个 call 是谁贡献的 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.XM.shot('balloon-above'));
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const groups = new Map();
    const kinds = new Map();
    let meshes = 0, inst = 0, tri = 0;
    const keyOf = (o) => {
      let n = o;
      while (n && n.parent && n.parent !== scene) n = n.parent;   // 顶层 scene 的直接子节点
      return (n && n.name) ? n.name : (n ? n.type+':'+(scene.children.indexOf(n)) : 'scene');
    };
    scene.traverse(o => {
      if (!o.visible) return;
      if (o.isInstancedMesh) { inst++; const c=o.count; tri += (o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3*c; }
      else if (o.isMesh || o.isPoints || o.isLine) {
        meshes++;
        const g = o.geometry;
        if (g && g.attributes && g.attributes.position) tri += (g.index?g.index.count:g.attributes.position.count)/3;
        const k = keyOf(o);
        groups.set(k, (groups.get(k)||0)+1);
        const kk = o.isPoints ? 'Points' : (o.isLine?'Line':(g?g.type:'?'));
        kinds.set(kk, (kinds.get(kk)||0)+1);
      }
    });
    return { meshes, inst, tri:Math.round(tri),
      groups:[...groups.entries()].sort((a,b)=>b[1]-a[1]).slice(0,22),
      kinds:[...kinds.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10),
      info:{ calls:window.__PROBE.renderer.info.render.calls, tris:window.__PROBE.renderer.info.render.triangles } };
  });
  console.log('场景可见 mesh', r.meshes, ' InstancedMesh', r.inst, ' 三角面', r.tri);
  console.log('渲染器:', JSON.stringify(r.info));
  console.log('\n按几何类型:'); r.kinds.forEach(k=>console.log('  ', k[0], k[1]));
  console.log('\n按顶层分组（mesh 数）:'); r.groups.forEach(g=>console.log('  ', String(g[1]).padStart(5), g[0]));
  await b.close();
})();
