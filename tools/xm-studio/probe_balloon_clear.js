/* 热气球落点净距体检：离铁路 / 离高物体（树阵、教堂、剧院）各多少米 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({viewport:{width:800,height:500}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/index.html', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.__PROBE && window.__SCENE, { timeout:90000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const T = window.__THREE, scene = window.__SCENE;
    const rail = new T.CatmullRomCurve3([
      new T.Vector3(-69.5,0,-32), new T.Vector3(0,0,-35), new T.Vector3(69.5,0,-32),
      new T.Vector3(69.5,0,-2), new T.Vector3(69.5,0,34), new T.Vector3(64,0,62),
      new T.Vector3(4,0,64), new T.Vector3(-64,0,62), new T.Vector3(-69.5,0,34),
      new T.Vector3(-69.5,0,-2)
    ], true, 'catmullrom', .20);
    const rp = rail.getSpacedPoints(700);
    const balloonRoots = new Set(window.__PROBE.balloons.map(x => x.g));
    const isBalloon = o => { let n=o; while(n){ if(balloonRoots.has(n)) return true; n=n.parent; } return false; };
    const tall = [];
    const box = new T.Box3(), v = new T.Vector3();
    scene.traverse(o => {
      if ((!o.isMesh && !o.isInstancedMesh) || !o.geometry) return;
      if (isBalloon(o)) return;
      o.updateWorldMatrix(true, false);
      box.setFromObject(o);
      if (!isFinite(box.min.y) || box.max.y < 4) return;
      const rXZ = Math.max(box.max.x-box.min.x, box.max.z-box.min.z)/2;
      if (rXZ > 40) return;
      box.getCenter(v);
      tall.push({ x:v.x, z:v.z, top:box.max.y, r:rXZ });
    });
    const out = [];
    for (const bl of window.__PROBE.balloons) {
      const x = bl.x, z = bl.z;
      let m = 1e9; for (const q of rp) { const d = Math.hypot(q.x-x, q.z-z); if (d<m) m=d; }
      const near = tall.map(o => ({ d:+(Math.hypot(o.x-x,o.z-z)-o.r).toFixed(1), o }))
        .sort((p,q)=>p.d-q.d).slice(0,6);
      out.push({ x, z, rail:+m.toFixed(1),
        near: near.map(n => `${n.d}m @(${n.o.x.toFixed(0)},${n.o.z.toFixed(0)}) 高${n.o.top.toFixed(0)}`) });
    }
    return { tallCount: tall.length, out };
  });
  console.log('高物体总数', r.tallCount);
  for (const o of r.out) {
    console.log(`热气球 (${o.x}, ${o.z})  离铁路 ${o.rail}m`);
    o.near.forEach(n => console.log('    近邻 ' + n));
  }
  await b.close();
})();
