/* 机位帧率实测（真实 GPU / ANGLE Metal）：固定机位，取 90 帧中位数 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const SHOTS = (process.argv[3] || 'balloon-above,wheel-chase,museum-gate,tree-avenue,carousel-chase,coaster-chase,fountain-garden').split(',');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(6000);
  for (const s of SHOTS) {
    await p.evaluate(x => window.XM.shot(x), s);
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => new Promise(res => {
      const times = []; let last = performance.now(); let i = 0;
      const tick = () => {
        const now = performance.now(); times.push(now - last); last = now;
        if (++i >= 90) {
          const arr = times.slice(8).sort((a, b) => a - b);
          const info = window.__PROBE.renderer.info.render;
          res({ fps: +(1000 / arr[Math.floor(arr.length / 2)]).toFixed(1), calls: info.calls, tris: info.triangles });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    console.log(s.padEnd(18), String(r.fps).padStart(6) + 'fps', String(r.calls).padStart(6) + 'calls', String(r.tris).padStart(9) + 'tris');
  }
  await b.close();
})();
