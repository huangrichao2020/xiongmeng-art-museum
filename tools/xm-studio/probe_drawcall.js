/* draw call 大户体检（2026-11-26）
   把场景里会被渲染的 mesh 按归属链分组统计，
   回答「几千个 draw call 到底是谁贡献的」。

   用法： node probe_drawcall.js
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
  });

  const audit = await pg.evaluate(() => {
    const T = window.XM_TOUR;
    const chains = {};
    let total = 0, inst = 0, lights = 0, pts = 0, shadowLights = 0;
    const mats = new Set();
    T.scene.traverse(o => {
      if (o.isLight) { lights++; if (o.isPointLight) pts++; if (o.castShadow) shadowLights++; }
      if (!o.isMesh || !o.visible) return;
      if (o.isInstancedMesh) inst++;
      let q = o; const chain = [];
      for (let i = 0; i < 4 && q; i++) {
        chain.push((q.userData && q.userData.tag) || q.name || q.type);
        q = q.parent;
      }
      const key = chain.join(' < ');
      chains[key] = (chains[key] || 0) + 1;
      total++;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m) mats.add(m.uuid);
    });
    return {
      total, inst, lights, pts, shadowLights, nMats: mats.size,
      top: Object.entries(chains).sort((a, b) => b[1] - a[1]).slice(0, 22),
      info: {
        calls: T.renderer.info.render.calls, tris: T.renderer.info.render.triangles,
        geo: T.renderer.info.memory.geometries, tex: T.renderer.info.memory.textures,
        prog: T.renderer.info.programs ? T.renderer.info.programs.length : -1
      }
    };
  });

  console.log('=== 场景总览 ===');
  console.log(`  可渲染 mesh        ${audit.total}（其中 InstancedMesh ${audit.inst}）`);
  console.log(`  材质种类           ${audit.nMats}`);
  console.log(`  灯光               ${audit.lights}（点光源 ${audit.pts}，投影灯 ${audit.shadowLights}）`);
  console.log(`  上一帧 draw call   ${audit.info.calls}   三角面 ${audit.info.tris}`);
  console.log(`  几何体/贴图/着色器  ${audit.info.geo} / ${audit.info.tex} / ${audit.info.prog}`);

  console.log('\n=== draw call 大户（归属链，前 22）===');
  for (const [k, v] of audit.top) console.log(`  ${String(v).padStart(5)}  ${k}`);

  /* 第二层：把「同一个 Group 实例」按位置聚类，
     看是不是同一批同款物件（NPC 小熊、摊位小车之类）各自没合批。 */
  const groups = await pg.evaluate(() => {
    const T = window.XM_TOUR;
    const buckets = {};
    T.scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      let g = o.parent;
      if (!g) return;
      const p = g.getWorldPosition(new T.THREE.Vector3());
      const key = [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)].join(',');
      const kk = key + ' | ' + ((g.userData && g.userData.tag) || g.name || g.type);
      if (!buckets[kk]) buckets[kk] = { n: 0, meshes: 0, mats: new Set(), kids: g.children.length };
      buckets[kk].n++;
      buckets[kk].meshes++;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m) buckets[kk].mats.add(m.color ? '#' + m.color.getHexString() : '?');
    });
    const list = Object.entries(buckets).map(([k, v]) => ({
      k, n: v.n, meshes: v.meshes, kids: v.kids,
      mats: [...v.mats].slice(0, 4).join(' ')
    }));
    list.sort((a, b) => b.meshes - a.meshes);
    return list.slice(0, 20);
  });
  console.log('\n=== 同一位置的 mesh 聚类（前 20）===');
  console.log('  mesh数  实例数  子节点  位置 | 名字 | 颜色');
  for (const g of groups) console.log(`  ${String(g.meshes).padStart(6)}  ${String(g.n).padStart(6)}  ${String(g.kids).padStart(6)}  ${g.k}  ${g.mats}`);

  await b.close();
})();
