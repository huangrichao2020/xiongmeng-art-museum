/* 区块代价表：逐个隐藏顶层区块，看每个区块吃掉多少帧率 / draw call
   用法: node probe_blockcost.js [shot] */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const SHOT = process.argv[3] || 'balloon-above';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(4000);
  await p.evaluate(s => window.XM.shot(s), SHOT);
  await p.waitForTimeout(4500);
  const sample = (n) => p.evaluate((N) => new Promise(res => {
    const times = []; let last = performance.now(); let i = 0;
    const tick = () => {
      const now = performance.now(); times.push(now - last); last = now;
      if (++i >= N) {
        const s = times.slice(4).sort((a,b)=>a-b);
        const info = window.__PROBE.renderer.info.render;
        res({ fps:+(1000/s[Math.floor(s.length/2)]).toFixed(1), calls:info.calls, tris:info.triangles });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);
  const tops = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const rows = [];
    scene.children.forEach((root,i) => {
      let m = 0;
      root.traverse(o => { if (o.visible && (o.isMesh||o.isPoints||o.isLine)) m++; });
      if (m > 40) rows.push({ i, name:root.name||root.type, tag:(root.userData&&root.userData.tag)||'', m });
    });
    rows.sort((a,b)=>b.m-a.m);
    return rows.slice(0,12);
  });
  const base = await sample(60);
  console.log('机位', SHOT, ' 基线', JSON.stringify(base));
  console.log('\n隐藏后 fps 提升 / draw call 减少：');
  for (const g of tops){
    await p.evaluate(i => { window.__PROBE.scene.children[i].visible = false; }, g.i);
    await p.waitForTimeout(500);
    const s = await sample(50);
    await p.evaluate(i => { window.__PROBE.scene.children[i].visible = true; }, g.i);
    await p.waitForTimeout(400);
    console.log(`  #${String(g.i).padStart(3)} ${g.name.padEnd(14)} tag=${(g.tag||'-').padEnd(7)} mesh=${String(g.m).padStart(5)}  fps ${String(base.fps).padStart(5)}→${String(s.fps).padStart(5)} (+${(s.fps-base.fps).toFixed(1)})  calls ${base.calls}→${s.calls} (-${base.calls-s.calls})`);
  }
  await b.close();
})();
