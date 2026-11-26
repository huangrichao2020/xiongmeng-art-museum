/* keep 子树里的重复件体检（2026-11-26）
   4293 个 mesh 在 keep 子树里（判定"会动"所以没合批）。
   这里按「几何形状签名 + 材质色」聚类，找出「同一款零件复制了很多份」的群体，
   这些如果整体只做刚体位移/旋转，就能改成 InstancedMesh，draw call 直接塌掉。

   用法： node probe_repeat.js
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
  });

  const r = await pg.evaluate(() => {
    const T = window.XM_TOUR;
    const inKeep = o => { let p = o; while (p) { if (p.userData && p.userData.keep) return true; p = p.parent; } return false; };
    const sigOf = g => {
      const p = g.parameters || {};
      const keys = Object.keys(p).sort().slice(0, 6).map(k => k + '=' + (typeof p[k] === 'number' ? p[k].toFixed(3) : p[k])).join(',');
      return (g.type || 'BUF') + '{' + keys + '}';
    };
    const groups = new Map();      // 顶层 keep 组 -> mesh 数
    const repeat = new Map();      // 几何签名+色 -> {n, chains}
    let keepMeshes = 0, keepGroups = 0;
    T.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      if (o.isInstancedMesh) return;
      if (!inKeep(o)) return;
      keepMeshes++;
      // 最近的有 tag/name 的祖先
      let p = o.parent, tag = '?';
      while (p && p !== T.scene) {
        if (p.userData && p.userData.tag) { tag = p.userData.tag; break; }
        if (p.name) { tag = p.name; break; }
        p = p.parent;
      }
      groups.set(tag, (groups.get(tag) || 0) + 1);
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const color = m && m.color ? m.color.getHexString() : '?';
      const key = sigOf(o.geometry) + ' #' + color;
      let e = repeat.get(key);
      if (!e) { e = { n: 0, chains: new Map() }; repeat.set(key, e); }
      e.n++;
      e.chains.set(tag, (e.chains.get(tag) || 0) + 1);
    });
    // 统计 keep 标记的顶层对象
    const keepRoots = [];
    T.scene.children.forEach(c => {
      let k = false; c.traverse(o => { if (o.userData && o.userData.keep) k = true; });
      if (k) keepRoots.push({ name: c.name || c.type, tag: (c.userData && c.userData.tag) || '', children: c.children.length });
    });
    const top = [...repeat.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([k, v]) => ({
      k, n: v.n, ch: [...v.chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0] + '×' + x[1]).join(' ')
    }));
    return {
      keepMeshes, keepGroups: groups.size,
      groups: [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
      top, keepRoots
    };
  });

  console.log(`=== keep 子树里的 mesh 共 ${r.keepMeshes} 个，分属 ${r.keepGroups} 个标记 ===`);
  console.log('\n=== 按最近带 tag 的祖先分组 ===');
  for (const [k, v] of r.groups) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log('\n=== 按「几何签名+颜色」找重复件（前 30）===');
  for (const t of r.top) console.log(`  ${String(t.n).padStart(5)}  ${t.k}\n           ${t.ch}`);
  console.log('\n=== 含 keep 标记的顶层对象 ===');
  for (const k of r.keepRoots) console.log(`  ${k.name}  tag=${k.tag}  子节点=${k.children}`);

  await b.close();
})();
