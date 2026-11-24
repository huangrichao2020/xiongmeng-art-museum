const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  for (const dsf of [1, 1.25, 1.55, 2]) {
    const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:dsf });
    const p = await ctx.newPage();
    await p.goto('https://preview.ai10088.com/alex-garage/', { waitUntil:'load', timeout:90000 });
    await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(async () => {
      const t0 = performance.now(); let n = 0;
      await new Promise(res => { const tick = () => { n++; if (n >= 50) return res(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      const dt = performance.now() - t0;
      const d = window.XM.debug();
      return { fps: +(50000/dt).toFixed(1), dpr: d.dpr };
    });
    const px = Math.round(1440*900*r.dpr);
    console.log('deviceScaleFactor=%s → 实际dpr=%s  像素 %s万  fps=%s', dsf, r.dpr, (px/10000).toFixed(0), r.fps);
    await ctx.close();
  }
  await b.close();
})();
