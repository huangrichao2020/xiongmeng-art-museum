/* 热气球腰带几何自检：腰带半径必须 ≥ 伞体该高度的实际外径，否则会陷进伞里 */
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
    const T = window.__THREE;
    const out = [];
    for (const bl of window.__PROBE.balloons) {
      const g = bl.g;
      // 找伞体瓜瓣 mesh（顶点数最多的那个）和腰带 torus
      let gore = null, band = null, band2 = null;
      g.traverse(o => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        if (!pos) return;
        if (pos.count > 200 && o.geometry.attributes.color && !gore) gore = o;
        if (o.geometry.type === 'TorusGeometry') {
          const rr = o.geometry.parameters.radius;
          if (rr > 3) { if (!band) band = o; else band2 = o; }
        }
      });
      if (!gore || !band) { out.push({ err:'mesh not found' }); continue; }
      const pos = gore.geometry.attributes.position;
      const by = band.position.y, b2y = band2 ? band2.position.y : null;
      let maxR = 0;
      for (let i=0;i<pos.count;i++){
        const y = pos.getY(i);
        if (Math.abs(y-by) > .25) continue;
        maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)));
      }
      let maxR2 = 0;
      if (band2) for (let i=0;i<pos.count;i++){
        const y = pos.getY(i);
        if (Math.abs(y-b2y) > .25) continue;
        maxR2 = Math.max(maxR2, Math.hypot(pos.getX(i), pos.getZ(i)));
      }
      out.push({
        bandY:+by.toFixed(2), bandR:+band.geometry.parameters.radius.toFixed(2),
        tube:+band.geometry.parameters.tube.toFixed(2),
        goreMaxR:+maxR.toFixed(2), 露出:+(band.geometry.parameters.radius+band.geometry.parameters.tube-maxR).toFixed(2),
        band2Y:b2y===null?null:+b2y.toFixed(2),
        band2R:band2?+band2.geometry.parameters.radius.toFixed(2):null,
        band2GoreMaxR:band2?+maxR2.toFixed(2):null,
        band2露出:band2?+(band2.geometry.parameters.radius+band2.geometry.parameters.tube-maxR2).toFixed(2):null
      });
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 2));
  await b.close();
})();
