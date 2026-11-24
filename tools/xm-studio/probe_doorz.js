/* 门正面几何深度精确测量：找出所有共面冲突
   用法: node probe_doorz.js <url> */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const p = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await p.goto(process.argv[2] || 'http://127.0.0.1:8811/', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout: 120000 });
  await p.waitForTimeout(8000);

  const out = await p.evaluate(() => {
    const { scene, THREE, SK } = window.__PROBE;
    // 找北街第一间店的 group：SHOPS[0] = x:-14.6, z:-30.1, rot:0
    const target = { x: -14.6, z: -30.1 };
    // 遍历找 group，其子 mesh 世界坐标 x≈-14.6 z≈-30.1
    let shopG = null;
    scene.traverse(o => {
      if (o.isGroup && o.children.length > 10) {
        const wp = new THREE.Vector3(); o.getWorldPosition(wp);
        if (Math.abs(wp.x - target.x) < 0.2 && Math.abs(wp.z - target.z) < 0.2) shopG = o;
      }
    });
    if (!shopG) {
      // 退而求其次：找含 SK.M.wood 的 mesh 群
      const cands = [];
      scene.traverse(o => {
        if (o.isMesh && o.material === SK.M.wood) {
          const wp = new THREE.Vector3(); o.getWorldPosition(wp);
          cands.push(wp.z);
        }
      });
      return { note: 'no group found', woodZ: cands.slice(0, 20) };
    }

    const rows = [];
    const bb = new THREE.Box3();
    shopG.traverse(o => {
      if (!o.isMesh) return;
      o.updateMatrixWorld(true);
      bb.setFromObject(o);
      const m = o.material;
      const col = m.color ? '#' + m.color.getHexString() : '-';
      const type = m.type + (m.blending === THREE.AdditiveBlending ? '+ADD' : '');
      rows.push({
        type, col,
        x: [+bb.min.x.toFixed(3), +bb.max.x.toFixed(3)],
        y: [+bb.min.y.toFixed(3), +bb.max.y.toFixed(3)],
        z: [+bb.min.z.toFixed(4), +bb.max.z.toFixed(4)],
        dw: m.depthWrite, dt: m.depthTest,
        blend: m.blending === THREE.AdditiveBlending ? 'add' : 'norm'
      });
    });

    // 找共面冲突：某个 mesh 的 maxZ 等于另一个 mesh 的 maxZ/minZ，且 x/y 有重叠
    const conflicts = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], c = rows[j];
      const ov = (p, q) => Math.min(p[1], q[1]) - Math.max(p[0], q[0]);
      const ox = ov(a.x, c.x), oy = ov(a.y, c.y), oz = ov(a.z, c.z);
      if (ox > 0.02 && oy > 0.02 && Math.abs(oz) < 0.002) {
        conflicts.push({ a: a.type + ' ' + a.col + ' z=' + a.z.join('..'), b: c.type + ' ' + c.col + ' z=' + c.z.join('..'), z: a.z[1], ovX: +ox.toFixed(3), ovY: +oy.toFixed(3) });
      }
    }
    return { shopPos: [target.x, target.z], meshCount: rows.length, rows: rows.sort((p, q) => p.z[0] - q.z[0]), conflicts };
  });
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
