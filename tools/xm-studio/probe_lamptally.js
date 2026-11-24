/* 数一下街道路灯还剩几根（按位置 z≈11.45、高于 2m 的柱子群聚） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(7000);
  const r = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const V = window.__THREE.Vector3;
    const p2 = new V();
    const xs = new Map();
    scene.traverse(o => {
      if (!o.isMesh) return;
      o.getWorldPosition(p2);
      if (Math.abs(p2.z - 11.45) < 0.45 && p2.y > 2.2) {
        const k = Math.round(p2.x);
        xs.set(k, (xs.get(k) || 0) + 1);
      }
    });
    let lights = 0;
    scene.traverse(o => { if (o.isPointLight) lights++; });
    return { xs: [...xs.entries()].sort((a, b) => a[0] - b[0]), lights, shopLights: window.__PROBE.shopLights.length };
  });
  console.log('z≈11.45 的高处杆件按 x 聚簇:', JSON.stringify(r.xs));
  console.log('场景 PointLight 数:', r.lights, ' shopLights 条目:', r.shopLights);
  await b.close();
})();
