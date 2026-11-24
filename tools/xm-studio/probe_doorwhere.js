/* 定位闪烁像素的屏幕位置 → 换算成世界坐标 → 报告命中对象
   冻结相机，遍历所有门（北街/西段/东段/市集/游乐园），逐个测
   用法: node probe_doorwhere.js <url> */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 650 } })).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await p.goto(process.argv[2] || 'http://127.0.0.1:8811/', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout: 120000 });
  await p.waitForTimeout(9000);

  const out = await p.evaluate(async () => {
    const { renderer, scene, camera, THREE } = window.__PROBE;
    const cv = renderer.domElement, w = cv.width, h = cv.height;
    const rc = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const meshList = [];
    scene.traverse(o => { if (o.isMesh && !o.isSprite) meshList.push(o); });

    function grab() {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d'); cx.drawImage(cv, 0, 0);
      return cx.getImageData(0, 0, w, h).data;
    }
    async function frames(n) {
      const o = [];
      for (let i = 0; i < n; i++) { await new Promise(r => requestAnimationFrame(() => r())); o.push(grab()); }
      return o;
    }

    // 相机放到北街街边，正对第一间店门
    const px = -14.6, faceZ = -28.3;
    camera.position.set(px, 1.5, faceZ + 7.0);
    camera.lookAt(px, 1.5, faceZ);
    camera.updateMatrixWorld(true);
    camera.matrixAutoUpdate = false;
    camera.matrixWorldAutoUpdate = false;
    await new Promise(r => setTimeout(r, 1200));

    const f = await frames(10);
    const N = f.length;
    const hot = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let mx = 0, sample = null;
      for (let k = 1; k < N; k++) {
        const d = Math.abs(f[k][i] - f[0][i]) + Math.abs(f[k][i + 1] - f[0][i + 1]) + Math.abs(f[k][i + 2] - f[0][i + 2]);
        if (d > mx) { mx = d; sample = [f[k][i], f[k][i + 1], f[k][i + 2]]; }
      }
      if (mx > 15) hot.push({ x, y, mx, sample, base: [f[0][i], f[0][i + 1], f[0][i + 2]] });
    }

    // 对每个闪烁像素射线，报告命中对象的材质与深度
    const tally = {};
    for (const hp of hot) {
      ndc.set((hp.x / w) * 2 - 1, -(hp.y / h) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const hits = rc.intersectObjects(meshList, false).filter(o => o.object.visible && o.object.material && o.object.material.opacity !== 0);
      if (!hits.length) { tally['<无命中>'] = (tally['<无命中>'] || 0) + 1; continue; }
      const o = hits[0].object, m = o.material;
      const col = m.color ? '#' + m.color.getHexString() : '-';
      const key = m.type + (m.blending === THREE.AdditiveBlending ? '+ADD' : '') + ' ' + col + ' map=' + (m.map ? (m.map.image ? m.map.image.width : '?') : '-');
      if (!tally[key]) tally[key] = { n: 0, zs: new Set(), sample: hp };
      tally[key].n++;
      tally[key].zs.add(hits[0].point.z.toFixed(3));
    }
    const outRows = Object.entries(tally).map(([k, v]) => ({
      what: k, n: v.n, zs: [...v.zs].slice(0, 8),
      at: [v.sample.x, v.sample.y],
      base: v.sample.base, after: v.sample.sample, delta: v.sample.mx
    })).sort((a, b) => b.n - a.n);

    // 闪烁像素在画面上的分布（分块统计）
    const grid = {};
    const CW = 100, CH = 65;
    hot.forEach(hp => {
      const k = ((hp.x / CW) | 0) + ',' + ((hp.y / CH) | 0);
      grid[k] = (grid[k] || 0) + 1;
    });
    const topGrid = Object.entries(grid).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return { hotTotal: hot.length, viewport: [w, h], outRows: outRows.slice(0, 10), topGrid };
  });
  console.log(JSON.stringify(out, null, 2));
  await p.screenshot({ path: '/tmp/doorwhere.png' });
  await b.close();
})();
