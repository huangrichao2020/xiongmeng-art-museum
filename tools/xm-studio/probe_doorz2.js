/* 门正面深度层测量：沿门中心从相机往里打射线，列出每层命中物的
   世界 Z、材质、类型 —— 找共面层
   用法: node probe_doorz2.js <url> */
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
    const { scene, camera, THREE, XM } = window.__PROBE;
    XM.shot('shops');
    const rc = new THREE.Raycaster();
    const px = -14.6;      // 店中心 X
    const faceZ = -30.1 + 1.8;  // 门所在平面 Z = -28.3
    const layers = {};

    // 只对 Mesh 列表求交（Sprite.raycast 需要 camera，场景里没设会报错）
    const meshList = [];
    scene.traverse(o => { if (o.isMesh && !o.isSprite) meshList.push(o); });

    // 在门前 8 个高度各打一条射线（沿 -Z 方向）
    for (let k = 0; k < 8; k++) {
      const y = 0.6 + k * 0.28;
      rc.set(new THREE.Vector3(px, y, faceZ + 12), new THREE.Vector3(0, 0, -1));
      const hits = rc.intersectObjects(meshList, false).filter(h => h.object.visible && h.object.material && h.object.material.opacity !== 0);
      const rows = hits.slice(0, 8).map(h => {
        const m = h.object.material;
        const col = m.color ? '#' + m.color.getHexString() : '-';
        const add = m.blending === THREE.AdditiveBlending ? '+ADD' : '';
        return {
          z: +h.point.z.toFixed(4),
          type: m.type + add,
          col,
          dw: m.depthWrite,
          map: m.map ? (m.map.image ? m.map.image.width + 'x' + m.map.image.height : '?') : '-',
          d: +h.distance.toFixed(3)
        };
      });
      layers['y=' + y.toFixed(2)] = rows;
    }
    return layers;
  });
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
