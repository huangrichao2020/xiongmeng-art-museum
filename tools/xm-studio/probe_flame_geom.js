const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1200,height:800}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(7000);
  const out = await p.evaluate(() => {
    const P = window.__PROBE, T = window.__THREE;
    const bb = P.balloons[0];
    const f = bb.flame;
    f.updateMatrixWorld(true);
    const pos = f.geometry.attributes.position;
    let minI = 0, maxI = 0;
    for (let i = 1; i < pos.count; i++) {
      if (pos.getY(i) < pos.getY(minI)) minI = i;
      if (pos.getY(i) > pos.getY(maxI)) maxI = i;
    }
    const v = new T.Vector3();
    const wp = (i) => { v.fromBufferAttribute(pos, i); f.localToWorld(v.clone()); return v.toArray().map(x=>+x.toFixed(3)); };
    // 底圈半径：取 minY 那圈所有顶点，算它到轴线的最大距离
    let rBase = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - pos.getY(minI)) < 1e-4) {
        const d = Math.hypot(pos.getX(i), pos.getZ(i));
        if (d > rBase) rBase = d;
      }
    }
    return {
      localYmin: +pos.getY(minI).toFixed(3), localYmax: +pos.getY(maxI).toFixed(3),
      baseRadius: +rBase.toFixed(3),
      apexLocal: [pos.getX(maxI), pos.getY(maxI), pos.getZ(maxI)].map(x=>+x.toFixed(3)),
      baseWorld: wp(minI), apexWorld: wp(maxI),
      meshPos: f.position.toArray(), scale: f.scale.toArray(),
      parentPos: f.parent.position.toArray()
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
