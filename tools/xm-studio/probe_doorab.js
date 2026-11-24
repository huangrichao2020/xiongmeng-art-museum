/* A/B 验证门闪烁修复：运行时把门口暖光贴片挪回 face+.12（旧的共面位置），
   再挪到 face+.17（新的位置），对比门中心区域闪烁像素数
   用法: node probe_doorab.js <url> */
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
    const px = -14.6, faceZ = -28.3;
    camera.position.set(px, 1.35, faceZ + 3.0);
    camera.lookAt(px, 1.2, faceZ);
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
    function diffCenter(f) {
      const N = f.length; let c = 0;
      const x0 = (w - 320) / 2 | 0, y0 = (h - 320) / 2 | 0;
      for (let y = y0; y < y0 + 320; y++) for (let x = x0; x < x0 + 320; x++) {
        const i = (y * w + x) * 4;
        for (let k = 1; k < N; k++) {
          const d = Math.abs(f[k][i] - f[0][i]) + Math.abs(f[k][i + 1] - f[0][i + 1]) + Math.abs(f[k][i + 2] - f[0][i + 2]);
          if (d > 10) { c++; break; }
        }
      }
      return c;
    }

    // 找「门口的暖光带」：合批后位置烘进几何，只能靠几何平移
    // 找出所有 #ffbe7a 加色贴片，取「竖直且 x 中心≈店中心、z≈门平面+0.17」的那批
    const bands = [];
    scene.traverse(o => {
      if (o.isMesh && !o.isSprite && o.material && o.material.type === 'MeshBasicMaterial'
        && o.material.blending === THREE.AdditiveBlending && o.material.color.getHexString() === 'ffbe7a') {
        const bb2 = new THREE.Box3().setFromObject(o);
        const cx = (bb2.min.x + bb2.max.x) / 2;
        const cy = (bb2.min.y + bb2.max.y) / 2;
        const cz = (bb2.min.z + bb2.max.z) / 2;
        const sz = bb2.max.z - bb2.min.z;
        const sy = bb2.max.y - bb2.min.y;
        const sx = bb2.max.x - bb2.min.x;
        // 竖直薄片：z 厚度 ~0，x 宽 1.5，y 高 2.2，中心在门上方
        if (sz < 0.02 && Math.abs(sx - 1.5) < 0.1 && Math.abs(sy - 2.2) < 0.1
          && Math.abs(cx - px) < 0.4 && Math.abs(cy - 1.30) < 0.2 && Math.abs(cz - (faceZ + 0.17)) < 0.05) {
          bands.push({ mesh: o, dz0: o.geometry.attributes.position ? 0 : 0 });
        }
      }
    });

    const res = { bandCount: bands.length };
    if (!bands.length) return res;

    // 合批后无法平移单个 mesh → 改用「隐藏全部 ffbe7a 竖贴片」等价模拟
    // 真正的 A/B 用「几何整体 z 偏移」：直接改 position 属性
    const bandGeos = bands.map(b => b.mesh.geometry);
    const origPos = bandGeos.map(g => g.attributes.position.array.slice());
    function shiftZ(d) {
      bandGeos.forEach((g, i) => {
        const a = g.attributes.position.array;
        for (let k = 0; k < a.length; k += 3) a[k + 2] = origPos[i][k + 2] + d;
        g.attributes.position.needsUpdate = true;
        g.computeBoundingBox();
      });
    }

    // 当前状态：face+.17 + polygonOffset
    await new Promise(r => setTimeout(r, 800));
    res.fixed_017_poly = diffCenter(await frames(12));

    // 旧的共面位置 face+.12，去掉 polygonOffset
    bands.forEach(b => { b.mesh.material.polygonOffset = false; b.mesh.material.needsUpdate = true; });
    shiftZ(-0.05);
    await new Promise(r => setTimeout(r, 1500));
    res.old_012_nopoly = diffCenter(await frames(12));

    // 旧的共面位置 face+.12，但保留 polygonOffset
    bands.forEach(b => {
      b.mesh.material.polygonOffset = true; b.mesh.material.polygonOffsetFactor = -4; b.mesh.material.polygonOffsetUnits = -4;
      b.mesh.material.needsUpdate = true;
    });
    await new Promise(r => setTimeout(r, 1500));
    res.old_012_poly = diffCenter(await frames(12));

    // 恢复
    shiftZ(0.05);
    await new Promise(r => setTimeout(r, 1500));
    res.restored = diffCenter(await frames(12));

    return res;
  });
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
