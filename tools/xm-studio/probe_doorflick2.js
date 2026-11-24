/* 门闪烁定位：二分法
   1) 射线取样变化像素 → 命中哪个对象
   2) 关闭阴影后是否还闪
   3) 隐藏门后是否还闪
   用法: node probe_doorflick2.js <url> */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await p.goto(process.argv[2] || 'http://127.0.0.1:8811/', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout: 120000 });
  await p.waitForTimeout(8000);

  await p.evaluate(() => {
    const { camera, XM } = window.__PROBE;
    XM.shot('shops');
    const px = -14.6, pz = -28.3 + 6.5, py = 2.6;
    camera.position.set(px, py, pz);
    camera.lookAt(px, 1.8, -28.3);
    camera.position.copy = () => {};
    camera.lookAt = () => {};
  });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(async () => {
    const { renderer, scene, camera, THREE } = window.__PROBE;
    const cv = renderer.domElement;
    const w = cv.width, h = cv.height;
    const rc = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function grab() {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.drawImage(cv, 0, 0);
      return cx.getImageData(0, 0, w, h).data;
    }
    async function frames(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        await new Promise(r => requestAnimationFrame(() => r()));
        out.push(grab());
      }
      return out;
    }
    function diffCount(f) {
      const N = f.length; let c = 0; const hot = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let mx = 0;
        for (let k = 1; k < N; k++) {
          const d = Math.abs(f[k][i] - f[0][i]) + Math.abs(f[k][i + 1] - f[0][i + 1]) + Math.abs(f[k][i + 2] - f[0][i + 2]);
          if (d > mx) mx = d;
        }
        if (mx > 12) { c++; hot.push([x, y, mx]); }
      }
      return { count: c, hot };
    }

    // 基线
    const base = diffCount(await frames(6));
    // 采样前 400 个热像素做射线，看命中什么
    const tally = {};
    for (let i = 0; i < Math.min(400, base.hot.length); i++) {
      const [x, y] = base.hot[i];
      ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const hits = rc.intersectObjects(scene.children, true).filter(o => o.object.visible && o.object.material && o.object.material.opacity !== 0 && o.object.material.type !== 'ShaderMaterial');
      if (!hits.length) { tally['<none>'] = (tally['<none>'] || 0) + 1; continue; }
      const o = hits[0].object;
      const m = o.material;
      const key = (m.map ? 'map:' + (m.map.image && m.map.image.width) + 'x' + (m.map.image && m.map.image.height) : 'nocolor') +
        ' | ' + (m.type) + ' | col:' + (m.color ? '#' + m.color.getHexString() : '-');
      tally[key] = (tally[key] || 0) + 1;
    }

    // 二分：关阴影
    const shadowWas = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.needsUpdate = true; }); } });
    await new Promise(r => setTimeout(r, 1200));
    const noShadow = diffCount(await frames(6));

    // 二分：恢复阴影，隐藏「门」材质组（wood/woodDark 但排除屋顶木）→ 用材质色+尺寸粗筛
    renderer.shadowMap.enabled = shadowWas;
    scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.needsUpdate = true; }); } });
    await new Promise(r => setTimeout(r, 1200));

    return {
      base: base.count, noShadow: noShadow.count,
      topHits: Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 12),
      basePct: +(base.count / (w * h) * 100).toFixed(3),
      noShadowPct: +(noShadow.count / (w * h) * 100).toFixed(3)
    };
  });
  console.log(JSON.stringify(out, null, 2));
  await p.screenshot({ path: '/tmp/doorflick2.png' });
  await b.close();
})();
