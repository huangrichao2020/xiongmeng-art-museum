/* 全场景共面冲突扫描：找出所有「加色贴片 与 不透明面 深度相同」的组合
   用法: node probe_coplanar.js <url> */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const p = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await p.goto(process.argv[2] || 'http://127.0.0.1:8811/', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout: 120000 });
  await p.waitForTimeout(9000);

  const out = await p.evaluate(() => {
    const { scene, THREE } = window.__PROBE;
    // 收集所有 mesh 的世界包围盒 + 材质特征
    const rows = [];
    const bb = new THREE.Box3();
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!o.isMesh || o.isSprite) return;
      const m = o.material;
      if (!m || Array.isArray(m)) return;
      if (m.opacity === 0) return;
      bb.setFromObject(o);
      if (!isFinite(bb.min.x)) return;
      rows.push({
        add: m.blending === THREE.AdditiveBlending,
        col: m.color ? '#' + m.color.getHexString() : '-',
        type: m.type,
        dw: m.depthWrite,
        min: [bb.min.x, bb.min.y, bb.min.z],
        max: [bb.max.x, bb.max.y, bb.max.z]
      });
    });

    // 加色贴片 vs 不透明面：沿 Z 轴比较（加色贴片多为竖直平面或水平）
    const conflicts = [];
    const adds = rows.filter(r => r.add && !r.dw);
    const opaq = rows.filter(r => !r.add && r.dw);
    for (const a of adds) {
      for (const c of opaq) {
        // Z 方向重叠厚度极小（<2mm）且 X/Y 有重叠 → 共面
        const oz = Math.min(a.max[2], c.max[2]) - Math.max(a.min[2], c.min[2]);
        const ox = Math.min(a.max[0], c.max[0]) - Math.max(a.min[0], c.min[0]);
        const oy = Math.min(a.max[1], c.max[1]) - Math.max(a.min[1], c.min[1]);
        if (ox > 0.05 && oy > 0.05 && Math.abs(oz) < 0.002) {
          conflicts.push({
            add: a.col + ' ' + a.type + ' z=' + a.min[2].toFixed(4) + '..' + a.max[2].toFixed(4) + ' x=' + a.min[0].toFixed(2) + '..' + a.max[0].toFixed(2),
            opq: c.col + ' ' + c.type + ' z=' + c.min[2].toFixed(4) + '..' + c.max[2].toFixed(4) + ' x=' + c.min[0].toFixed(2) + '..' + c.max[0].toFixed(2),
            ovX: +ox.toFixed(2), ovY: +oy.toFixed(2),
            at: [+((a.min[0] + a.max[0]) / 2).toFixed(1), +((a.min[1] + a.max[1]) / 2).toFixed(1), +((a.min[2] + a.max[2]) / 2).toFixed(2)]
          });
        }
      }
    }
    return { meshTotal: rows.length, addTotal: adds.length, conflictTotal: conflicts.length, conflicts: conflicts.slice(0, 60) };
  });
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
