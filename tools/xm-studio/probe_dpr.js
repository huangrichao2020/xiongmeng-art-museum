const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  await p.goto('https://preview.ai10088.com/alex-garage/', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(3000);
  const rows = await p.evaluate(async () => {
    const out = [];
    // 直接操纵 renderer：页面没暴露它，改用逐档改 window.devicePixelRatio 不可行，
    // 所以退而求其次：测不同视口尺寸下的 fps（等效像素量不同）
    return out;
  });
  // 逐个视口测（像素量 = w*h*dpr）
  for (const [w,h] of [[1440,900],[1280,800],[1120,700],[960,600],[820,512],[640,400]]) {
    await p.setViewportSize({ width:w, height:h });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(async () => {
      const t0 = performance.now(); let n = 0;
      await new Promise(res => { const tick = () => { n++; if (n >= 45) return res(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      const dt = performance.now() - t0;
      const d = window.XM.debug();
      return { fps: +(45000/dt).toFixed(1), dpr: d.dpr, calls: d.draw.calls, tris: d.draw.tris };
    });
    const px = Math.round(w*h*r.dpr);
    console.log('视口 %dx%d  dpr=%s  像素 %s万  fps=%s  draw=%s', w, h, r.dpr, (px/10000).toFixed(0), r.fps, r.calls);
  }
  await b.close();
})();
