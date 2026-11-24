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
  const count = () => p.evaluate(() => {
    let m=0; window.__PROBE.scene.traverse(o=>{ if(o.visible&&(o.isMesh||o.isPoints||o.isLine))m++; });
    return m;
  });
  console.log('基线:', JSON.stringify(await sample(60)), '可见 mesh', await count());
  // 实验：再合批一次 fair + 所有「小摊位组」
  const merged = await p.evaluate(() => {
    const P = window.__PROBE, scene = P.scene;
    const done = [];
    const dyn = new Set(P.amusement.dyn || []);
    for (const root of scene.children.slice()) {
      let m = 0; root.traverse(o=>{ if(o.visible&&(o.isMesh||o.isPoints||o.isLine))m++; });
      if (m < 40) continue;
      if (root === scene.children[220]) continue;   // fair 单独处理
      try { P.mergeStatic(root); done.push(root.name||root.type); } catch(e){ done.push('ERR '+root.name+' '+e.message); }
    }
    const fair = scene.children.find(c=>c.userData && c.userData.tag==='fair');
    if (fair) { try { P.mergeStatic(fair, dyn); done.push('fair(dyn skip)'); } catch(e){ done.push('ERR fair '+e.message); } }
    return done;
  });
  await p.waitForTimeout(2500);
  console.log('合批对象:', JSON.stringify(merged));
  console.log('合批后:', JSON.stringify(await sample(60)), '可见 mesh', await count());
  await p.screenshot({ path:'/tmp/rectest/merged_'+SHOT+'.png' });
  await b.close();
})();
