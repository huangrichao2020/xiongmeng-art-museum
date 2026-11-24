/* 门闪烁取证：固定机位逐帧抓 canvas 像素，找出变化的区域
   用法: node probe_doorflick.js <url> */
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

  // 接管相机：北街第一家店（x=-14.6, z=-30.1）门在 +Z 面，face=+1.8 → 门世界 z=-28.3
  const info = await p.evaluate(async () => {
    const { camera, scene, renderer, THREE, XM } = window.__PROBE;
    XM.shot('shops');
    // 锁死相机
    const px = -14.6, pz = -28.3 + 6.5, py = 2.6;
    camera.position.set(px, py, pz);
    camera.lookAt(px, 1.8, -28.3);
    camera.position.copy = () => {};
    camera.lookAt = () => {};
    camera.updateMatrixWorld(true);
    return { ok: true };
  });
  await p.waitForTimeout(2500);

  // 逐帧抓像素并比较
  const res = await p.evaluate(async () => {
    const { renderer, scene, camera } = window.__PROBE;
    const cv = renderer.domElement;
    const w = cv.width, h = cv.height;
    function grab() {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.drawImage(cv, 0, 0);
      return cx.getImageData(0, 0, w, h).data;
    }
    const frames = [];
    for (let i = 0; i < 8; i++) {
      await new Promise(r => requestAnimationFrame(() => r()));
      frames.push(grab());
    }
    // 逐像素统计最大变化
    const N = frames.length;
    let changed = 0, maxDelta = 0;
    const hot = [];
    const cellW = 40, cellH = 40;
    const cells = {};
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let mx = 0;
      for (let f = 1; f < N; f++) {
        const d = Math.abs(frames[f][i] - frames[0][i]) + Math.abs(frames[f][i + 1] - frames[0][i + 1]) + Math.abs(frames[f][i + 2] - frames[0][i + 2]);
        if (d > mx) mx = d;
      }
      if (mx > 12) {
        changed++;
        if (mx > maxDelta) maxDelta = mx;
        const key = ((x / cellW) | 0) + ',' + ((y / cellH) | 0);
        cells[key] = (cells[key] || 0) + 1;
      }
    }
    const hotCells = Object.entries(cells).sort((a, b) => b[1] - a[1]).slice(0, 14);
    return { w, h, changed, total: w * h, pct: +(changed / (w * h) * 100).toFixed(3), maxDelta, hotCells, calls: renderer.info.render.calls };
  });
  console.log(JSON.stringify(res, null, 2));
  await p.screenshot({ path: '/tmp/doorflick.png' });
  await b.close();
})();
