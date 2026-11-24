/* 中央龙猫打光分档对照：关灯 / 只开聚光 / 聚光+光池 / 加光幕
   注意：每帧 shopLights 会把 light.intensity 覆写回 base，所以必须改 entry.base */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
  await p.goto(SITE, { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.__PROBE && window.__PROBE.spot, { timeout:90000 });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { const P=window.__PROBE; P.exitWalk(); P.freeze(); P.park(); });
  await p.waitForTimeout(1200);
  const set = (o) => p.evaluate((cfg) => {
    const P = window.__PROBE, S = P.spot;
    const entry = P.shopLights.find(s=>s.l===S.light);
    entry.base = cfg.light;                       // 每帧覆写 intensity，必须改 base
    if (S.beam){ S.beam.visible = !!cfg.beam; if (cfg.beamOp != null) S.beam.material.opacity = cfg.beamOp; }
    S.poolTop.visible = !!cfg.pools;
    S.poolGnd.visible = !!cfg.pools;
    if (cfg.poolOp != null){ S.poolTop.material.opacity = cfg.poolOp; S.poolGnd.material.opacity = cfg.poolOp*.5; }
  }, o);
  const shots = [
    ['final', {light:1000, beam:false, pools:true, poolOp:.30}],
  ];
  for (const [name,cfg] of shots){
    await set(cfg);
    await p.evaluate(()=>window.__PROBE.park());
    await p.waitForTimeout(500);
    for (let i=0;i<1;i++){
      await p.evaluate(()=>window.__PROBE.park());
      await p.waitForTimeout(260);
      await p.screenshot({ path:`/tmp/tot_${name}_${i}.png` });
    }
    console.log('shot', name, JSON.stringify(cfg));
  }
  await b.close();
})();
