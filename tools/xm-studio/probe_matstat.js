/* 材质构成体检（2026-11-26）
   回答：1715 种材质里有多少是「带独立贴图的」（每种至少 1 个 draw call，合并也压不下去），
   有多少是纯色的（可以被共享/烘成顶点色）。

   用法： node probe_matstat.js
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
    const matInfo = new Map();   // uuid -> {meshes, hasMap, mapUuid, tex, color, type, transparent, emissive}
    let total = 0, kept = 0;
    const chainOf = o => {
      const c = []; let q = o;
      for (let i = 0; i < 3 && q; i++) { c.push((q.userData && q.userData.tag) || q.name || q.type); q = q.parent; }
      return c.join('<');
    };
    const byChain = {};
    T.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      if (o.isInstancedMesh) return;
      total++;
      let p = o, inKeep = false;
      while (p) { if (p.userData && p.userData.keep) { inKeep = true; break; } p = p.parent; }
      if (inKeep) kept++;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m) return;
      let mi = matInfo.get(m.uuid);
      if (!mi) {
        mi = {
          meshes: 0, hasMap: !!m.map, mapUuid: m.map ? m.map.uuid : null,
          color: m.color ? m.color.getHexString() : '?', type: m.type,
          transparent: !!m.transparent, emissive: m.emissive ? m.emissive.getHexString() : '000000',
          roughness: m.roughness, metalness: m.metalness, chain: chainOf(o)
        };
        matInfo.set(m.uuid, mi);
      }
      mi.meshes++;
      const ch = chainOf(o);
      byChain[ch] = (byChain[ch] || 0) + 1;
    });
    const mats = [...matInfo.values()];
    const withMap = mats.filter(m => m.hasMap);
    const noMap = mats.filter(m => !m.hasMap);
    // 贴图共享情况：多少材质共用同一张 map
    const mapUsers = new Map();
    withMap.forEach(m => mapUsers.set(m.mapUuid, (mapUsers.get(m.mapUuid) || 0) + 1));
    // 同色同参（忽略贴图）能合并成多少种
    const sig = new Map();
    noMap.forEach(m => {
      const k = [m.color, m.type, m.transparent, m.emissive, m.roughness, m.metalness].join('|');
      sig.set(k, (sig.get(k) || 0) + 1);
    });
    const uniq = k => {
      const s = new Set(); noMap.forEach(m => {
        s.add([m.color, m.type, m.transparent, m.emissive, m.roughness, m.metalness].join('|'));
      }); return s.size;
    };
    return {
      total, kept, nMats: mats.length, withMap: withMap.length, noMap: noMap.length,
      mapCount: mapUsers.size,
      mapShared: [...mapUsers.values()].filter(v => v > 1).length,
      noMapSigCount: uniq(),
      noMapMeshCount: noMap.reduce((a, m) => a + m.meshes, 0),
      withMapMeshCount: withMap.reduce((a, m) => a + m.meshes, 0),
      topMats: mats.sort((a, b) => b.meshes - a.meshes).slice(0, 18),
      chains: Object.entries(byChain).sort((a, b) => b[1] - a[1]).slice(0, 14),
      types: mats.reduce((a, m) => { a[m.type] = (a[m.type] || 0) + 1; return a; }, {})
    };
  });

  console.log('=== 材质构成 ===');
  console.log(`  可渲染普通 mesh     ${r.total}（其中在 keep 子树里 ${r.kept}）`);
  console.log(`  材质种类            ${r.nMats}   类型分布 ${JSON.stringify(r.types)}`);
  console.log(`  带贴图材质          ${r.withMap}（占 mesh ${r.withMapMeshCount}）`);
  console.log(`  纯色材质            ${r.noMap}（占 mesh ${r.noMapMeshCount}）`);
  console.log(`  贴图张数            ${r.mapCount}，其中被多个材质共用 ${r.mapShared} 张`);
  console.log(`  纯色材质按(色+参数)去重后只剩 ${r.noMapSigCount} 种`);

  console.log('\n=== mesh 数最多的材质 ===');
  for (const m of r.topMats) {
    console.log(`  ${String(m.meshes).padStart(4)} mesh  ${m.hasMap ? '[贴图]' : '[纯色]'} ${m.type} 色#${m.color} 发光#${m.emissive} rough${m.roughness} metal${m.metalness}  ${m.chain}`);
  }
  console.log('\n=== 归属链 ===');
  for (const [k, v] of r.chains) console.log(`  ${String(v).padStart(5)}  ${k}`);

  await b.close();
})();
