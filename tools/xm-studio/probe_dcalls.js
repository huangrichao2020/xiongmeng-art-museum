/* draw call 归因：哪些组没被合批、为什么 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(6000);   // 等自动合批跑完
  const out = await pg.evaluate(() => {
    const scene = window.diorama.scene();
    const res = { total: 0, groups: [], keepTop: [] };
    scene.traverse(o => { if (o.isMesh) res.total++; });
    for (const g of scene.children) {
      let mesh = 0, keepMesh = 0, inst = 0, keepRoots = new Set();
      g.traverse(o => {
        if (o.isInstancedMesh) { inst++; return; }
        if (!o.isMesh) return;
        mesh++;
        // 往上找第一个 keep 祖先
        let p = o, kr = null;
        while (p && p !== g) { if (p.userData && p.userData.keep) { kr = p; break; } p = p.parent; }
        if (kr) { keepMesh++; keepRoots.add((kr.name || kr.type) + '|' + (kr.userData.tag || '')); }
      });
      res.groups.push({ tag: g.userData && g.userData.tag || g.name || g.type, mesh, keepMesh, inst, keep: !!(g.userData && g.userData.keep) });
    }
    res.groups.sort((a, b) => b.mesh - a.mesh);
    // keep 根节点排行
    const kr = {};
    scene.traverse(o => {
      if (o.userData && o.userData.keep) {
        const key = (o.name || o.type) + '|' + (o.userData.tag || '');
        kr[key] = kr[key] || { n: 0, tag: o.userData.tag || '' };
      }
    });
    scene.traverse(o => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      let p = o.parent, k = null;
      while (p) { if (p.userData && p.userData.keep) { k = p; break; } p = p.parent; }
      if (k) { const key = (k.name || k.type) + '|' + (k.userData.tag || ''); kr[key].n++; }
    });
    res.keepTop = Object.entries(kr).map(([k, v]) => ({ k, n: v.n })).sort((a, b) => b.n - a.n).slice(0, 25);
    res.perf = window.diorama.perf();
    // 材质种类
    const mats = new Set();
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m.uuid)); });
    res.matCount = mats.size;
    return res;
  });
  console.log('total meshes =', out.total, '| materials =', out.matCount, '| perf =', JSON.stringify(out.perf));
  console.log('--- groups (mesh / keepMesh / instanced) ---');
  out.groups.slice(0, 18).forEach(g => console.log(String(g.mesh).padStart(5), String(g.keepMesh).padStart(5), String(g.inst).padStart(4), g.tag, g.keep ? '(keep)' : ''));
  console.log('--- keep roots by mesh count ---');
  out.keepTop.forEach(k => console.log(String(k.n).padStart(5), k.k));
  await b.close();
})();
