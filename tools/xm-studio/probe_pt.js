const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({viewport:{width:800,height:500}})).newPage();
  await p.goto('http://127.0.0.1:8811/index.html', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.__OK, { timeout: 90000 });
  await p.waitForTimeout(2000);
  const pts = [[-44,50],[-48,52],[-52,50],[-56,48],[-58,50],[-60,52],[-62,54],[-56,44],[-60,58],[-44,44],[44,50],[48,52],[52,50],[56,48],[56,44],[-62,72],[62,72]];
  const r = await p.evaluate((pts) => {
    const T = window.__THREE, scene = window.__SCENE;
    const rail = new T.CatmullRomCurve3([
      new T.Vector3(-69.5,0,-32), new T.Vector3(0,0,-35), new T.Vector3(69.5,0,-32),
      new T.Vector3(69.5,0,-2), new T.Vector3(69.5,0,34), new T.Vector3(64,0,62),
      new T.Vector3(4,0,64), new T.Vector3(-64,0,62), new T.Vector3(-69.5,0,34),
      new T.Vector3(-69.5,0,-2)
    ], true, 'catmullrom', .20);
    const rp = rail.getSpacedPoints(700);
    const tall = [];
    const box = new T.Box3(), v = new T.Vector3();
    scene.traverse(o => {
      if ((!o.isMesh && !o.isInstancedMesh) || !o.geometry) return;
      o.updateWorldMatrix(true, false);
      box.setFromObject(o);
      if (!isFinite(box.min.y) || box.max.y < 5) return;
      box.getCenter(v);
      const rXZ = Math.max(box.max.x-box.min.x, box.max.z-box.min.z)/2;
      if (rXZ > 40) return;
      tall.push({ x:v.x, z:v.z, top:box.max.y, r:rXZ });
    });
    return pts.map(([x,z]) => {
      let m=1e9; for (const q of rp) { const d=Math.hypot(q.x-x,q.z-z); if(d<m)m=d; }
      let t=1e9, who=null;
      for (const o of tall) { const d=Math.hypot(o.x-x,o.z-z)-o.r; if(d<t){t=d;who=o;} }
      return { x, z, rail:+m.toFixed(1), tall:+t.toFixed(1), who: who?`(${who.x.toFixed(0)},${who.z.toFixed(0)},top${who.top.toFixed(0)})`:'-' };
    });
  }, pts);
  for (const x of r) console.log(`(${x.x},${x.z})  离轨道 ${x.rail}m  离高物 ${x.tall}m  最近 ${x.who}`);
  await b.close();
})();
