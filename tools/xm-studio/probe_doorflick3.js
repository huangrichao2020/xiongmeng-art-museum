/* 门闪烁精确定位：对着门正面拍，逐帧差分 → 二分隐藏候选
   候选：门口的加色贴片(dg/st/gl/halo)、门扇、阴影
   用法: node probe_doorflick3.js <url> */
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

  const out = await p.evaluate(async () => {
    const { renderer, scene, camera, THREE, XM } = window.__PROBE;
    XM.shot('shops');
    const px = -14.6, pz = -28.3 + 3.2, py = 1.5;
    camera.position.set(px, py, pz);
    camera.lookAt(px, 1.3, -28.3);
    camera.position.copy = () => {};
    camera.lookAt = () => {};
    await new Promise(r => setTimeout(r, 1500));

    const cv = renderer.domElement, w = cv.width, h = cv.height;
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
    function diff(f) {
      const N = f.length; let c = 0; const hot = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4; let mx = 0;
        for (let k = 1; k < N; k++) {
          const d = Math.abs(f[k][i] - f[0][i]) + Math.abs(f[k][i + 1] - f[0][i + 1]) + Math.abs(f[k][i + 2] - f[0][i + 2]);
          if (d > mx) mx = d;
        }
        if (mx > 10) { c++; hot.push([x, y, mx]); }
      }
      return { c, hot };
    }

    const res = {};

    // A. 找到所有"门前加色贴片"（MeshBasicMaterial + AdditiveBlending）
    const additive = [];
    scene.traverse(o => {
      if (o.isMesh && o.material && o.material.type === 'MeshBasicMaterial' && o.material.blending === THREE.AdditiveBlending) {
        const wp = new THREE.Vector3(); o.getWorldPosition(wp);
        if (Math.abs(wp.x - px) < 6 && Math.abs(wp.z - (-28.3)) < 6) additive.push(o);
      }
    });
    res.additiveCount = additive.length;

    // B. 基线
    const base = diff(await frames(6));
    res.base = base.c;

    // C. 隐藏门前所有加色贴片
    additive.forEach(o => o.visible = false);
    await new Promise(r => setTimeout(r, 800));
    const noAdd = diff(await frames(6));
    res.noAdditive = noAdd.c;
    additive.forEach(o => o.visible = true);

    // D. 关闭阴影
    await new Promise(r => setTimeout(r, 800));
    const sw = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
    await new Promise(r => setTimeout(r, 1200));
    const noSh = diff(await frames(6));
    res.noShadow = noSh.c;
    renderer.shadowMap.enabled = sw;
    scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });

    // E. 热像素的位置分布（判断是门区域还是全屏）
    const bb = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
    base.hot.forEach(([x, y]) => { bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.y0 = Math.min(bb.y0, y); bb.y1 = Math.max(bb.y1, y); });
    res.hotBox = bb;
    res.hotTotal = base.hot.length;
    // 热像素在中下方的比例（门应该在画面中部）
    const lowerHalf = base.hot.filter(([x, y]) => y > h * 0.35).length;
    res.hotLower = lowerHalf;

    return res;
  });
  console.log(JSON.stringify(out, null, 2));
  await p.screenshot({ path: '/tmp/doorflick3.png' });
  await b.close();
})();
