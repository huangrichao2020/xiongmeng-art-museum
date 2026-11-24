/* 验证：给所有加色贴片加 polygonOffset 后，门正面是否还闪烁
   同时输出「门口区域(门 x±1.5, y 0.3..2.4)」内的闪烁像素数
   用法: node probe_doorfix.js <url> */
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

  const out = await p.evaluate(async () => {
    const { renderer, scene, camera, THREE, XM } = window.__PROBE;
    XM.shot('shops');
    // 门中心世界坐标：店 x=-14.6, 门平面 z=-28.3
    const px = -14.6, pz = -28.3 + 3.0;
    camera.position.set(px, 1.35, pz);
    camera.lookAt(px, 1.2, -28.3);
    camera.updateMatrixWorld(true);
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
    // 门在画面中央：只统计中心 300x300 区域
    function diffCenter(f) {
      const N = f.length; let c = 0, cAll = 0;
      const x0 = (w - 300) / 2 | 0, y0 = (h - 300) / 2 | 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let mx = 0;
        for (let k = 1; k < N; k++) {
          const d = Math.abs(f[k][i] - f[0][i]) + Math.abs(f[k][i + 1] - f[0][i + 1]) + Math.abs(f[k][i + 2] - f[0][i + 2]);
          if (d > mx) mx = d;
        }
        if (mx > 10) {
          cAll++;
          if (x >= x0 && x < x0 + 300 && y >= y0 && y < y0 + 300) c++;
        }
      }
      return { center: c, all: cAll };
    }

    const res = {};
    await new Promise(r => setTimeout(r, 800));
    const base = diffCenter(await frames(10));
    res.base = base;

    // 隐藏所有加色贴片
    const decals = [];
    scene.traverse(o => { if (o.isMesh && !o.isSprite && o.material && o.material.type === 'MeshBasicMaterial' && o.material.blending === THREE.AdditiveBlending) decals.push(o); });
    decals.forEach(o => o.visible = false);
    await new Promise(r => setTimeout(r, 800));
    res.noDecal = diffCenter(await frames(10));
    decals.forEach(o => o.visible = true);

    // 全局 polygonOffset
    await new Promise(r => setTimeout(r, 800));
    decals.forEach(o => {
      o.material.polygonOffset = true;
      o.material.polygonOffsetFactor = -6;
      o.material.polygonOffsetUnits = -6;
      o.material.needsUpdate = true;
    });
    await new Promise(r => setTimeout(r, 1500));
    res.polyOffset = diffCenter(await frames(10));

    return res;
  });
  console.log(JSON.stringify(out, null, 2));
  await p.screenshot({ path: '/tmp/doorfix.png' });
  await b.close();
})();
