/* 加载期卡顿检查：开场 6 秒内的帧时间分布（合批动作会不会造成明显卡顿） */
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
  const r = await p.evaluate(async () => {
    const times = []; let last = performance.now();
    const t0 = last;
    await new Promise(res => {
      const tick = () => {
        const now = performance.now(); times.push([+(now - t0).toFixed(0), +(now - last).toFixed(1)]); last = now;
        if (now - t0 > 6000) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const slow = times.filter(x => x[1] > 60);
    const after = times.filter(x => x[0] > 2500).map(x => x[1]).sort((a, b) => a - b);
    return { total: times.length, slow: slow.slice(0, 12), med: after[Math.floor(after.length / 2)], max: after[after.length - 1] };
  });
  console.log('采样帧数', r.total, '| 2.5s 后中位帧时', r.med + 'ms', '最大', r.max + 'ms');
  console.log('>60ms 的慢帧(时刻ms, 帧时ms):', JSON.stringify(r.slow));
  await b.close();
})();
