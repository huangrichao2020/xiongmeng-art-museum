/* 全机位性能体检：每个导演机位量 墙钟帧率(中位数) + draw call + 三角面 + DPR
   帧率用 performance.now() 墙钟差（不能用被 clamp 过的 dt），每机位 90 帧取中位数 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.XM.shots, { timeout:120000 });
  await p.waitForTimeout(4000);
  const shots = await p.evaluate(() => window.XM.shots().map(s => s.id));
  const sample = (n) => p.evaluate((N) => new Promise(res => {
    const times = []; let last = performance.now(); let i = 0;
    const tick = () => {
      const now = performance.now(); times.push(now - last); last = now;
      if (++i >= N) {
        const s = times.slice(5).sort((a,b)=>a-b);
        const med = s[Math.floor(s.length/2)];
        const p90 = s[Math.floor(s.length*0.9)];
        const info = window.__PROBE.renderer.info.render;
        res({ fps:+(1000/med).toFixed(1), p90fps:+(1000/p90).toFixed(1),
              calls:info.calls, tris:info.triangles,
              dpr:window.__PROBE.renderer.getPixelRatio(),
              camY:+window.__PROBE.camera.position.y.toFixed(1),
              px:Math.round(innerWidth*innerHeight*Math.pow(window.__PROBE.renderer.getPixelRatio(),2)) });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);
  console.log('机位'.padEnd(20)+'fps(中位)'.padEnd(11)+'p90fps'.padEnd(9)+'calls'.padEnd(8)+'三角面'.padEnd(10)+'DPR'.padEnd(7)+'像素');
  const rows=[];
  for (const id of shots){
    await p.evaluate(s => window.XM.shot(s), id);
    await p.waitForTimeout(3200);          // 等机位稳定（摩天轮要升空）
    const s = await sample(90);
    rows.push({id, ...s});
    console.log(id.padEnd(20)+String(s.fps).padEnd(11)+String(s.p90fps).padEnd(9)+String(s.calls).padEnd(8)+String(s.tris).padEnd(10)+String(s.dpr).padEnd(7)+s.px);
  }
  await b.close();
  rows.sort((a,b)=>a.fps-b.fps);
  console.log('\n最卡的 5 个机位：');
  rows.slice(0,5).forEach(r=>console.log('  ', r.id, r.fps+'fps', r.calls+' calls'));
})();
