/* 门闪烁根因钉死：
   A. 冻结相机（彻底）
   B. 基线差分
   C. 隐藏门前加色光斑贴片 → 差分应骤降
   D. 给光斑贴片加 polygonOffset → 差分应骤降
   用法: node probe_doorflick4.js <url> */
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
    camera.updateMatrixWorld(true);
    // 彻底冻结相机
    camera.matrixAutoUpdate = false;
    camera.matrixWorldAutoUpdate = false;

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
      const N = f.length; let c = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        for (let k = 1; k < N; k++) {
          const d = Math.abs(f[k][i] - f[0][i]) + Math.abs(f[k][i + 1] - f[0][i + 1]) + Math.abs(f[k][i + 2] - f[0][i + 2]);
          if (d > 10) { c++; break; }
        }
      }
      return c;
    }

    const res = {};

    // 收集所有加色光斑贴片（MeshBasic + Additive）
    const decals = [];
    scene.traverse(o => {
      if (o.isMesh && o.material && o.material.type === 'MeshBasicMaterial' && o.material.blending === THREE.AdditiveBlending) decals.push(o);
    });
    res.decalTotal = decals.length;

    // 基线（冻结相机后）
    await new Promise(r => setTimeout(r, 800));
    res.base = diff(await frames(8));

    // C. 隐藏所有加色贴片
    decals.forEach(o => o.visible = false);
    await new Promise(r => setTimeout(r, 800));
    res.noDecal = diff(await frames(8));
    decals.forEach(o => o.visible = true);

    // D. 给加色贴片加 polygonOffset（拉近深度）
    await new Promise(r => setTimeout(r, 800));
    decals.forEach(o => {
      o.material.polygonOffset = true;
      o.material.polygonOffsetFactor = -4;
      o.material.polygonOffsetUnits = -4;
      o.material.needsUpdate = true;
    });
    await new Promise(r => setTimeout(r, 1200));
    res.polygonOffset = diff(await frames(8));

    // E. 单独：只隐藏「门口暖光带」色 #ffbe7a
    await new Promise(r => setTimeout(r, 800));
    const band = decals.filter(o => o.material.color.getHexString() === 'ffbe7a');
    res.bandCount = band.length;
    band.forEach(o => o.visible = false);
    await new Promise(r => setTimeout(r, 800));
    res.noBand = diff(await frames(8));
    band.forEach(o => o.visible = true);

    return res;
  });
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
