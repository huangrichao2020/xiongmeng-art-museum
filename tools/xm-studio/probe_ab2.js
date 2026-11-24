/* 终版 A/B：同一个机位，2 秒内连采 30 次 calls + 帧时，取中位数（抵消镜头漂移） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2];
const LABEL = process.argv[3] || 'site';
const SHOTS = (process.argv[4] || 'balloon-above,museum-gate,tree-avenue,fountain-garden,carousel-chase').split(',');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(8000);
  console.log('== ' + LABEL + ' ==');
  for (const s of SHOTS) {
    await p.evaluate(x => window.XM.shot(x), s);
    await p.waitForTimeout(2000);
    const r = await p.evaluate(async () => {
      const calls = [], times = [];
      let last = performance.now();
      await new Promise(res => {
        let i = 0;
        const tick = () => {
          const now = performance.now();
          times.push(now - last); last = now;
          calls.push(window.__PROBE.renderer.info.render.calls);
          if (++i >= 40) return res();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const med = a => { const s2 = a.slice().sort((x, y) => x - y); return s2[Math.floor(s2.length / 2)]; };
      const t = times.slice(6);
      return { calls: med(calls), fps: +(1000 / med(t)).toFixed(1) };
    });
    console.log(s.padEnd(16), String(r.calls).padStart(6) + 'calls', String(r.fps).padStart(6) + 'fps');
  }
  await b.close();
})();
