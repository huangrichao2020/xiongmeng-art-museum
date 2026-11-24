/* 碰碰车 NaN 定位：逐帧打印关键量 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport:{width:1280,height:720} });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
  await p.goto(SITE, { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.__PROBE, { timeout:90000 });
  await p.waitForTimeout(1500);
  const out = await p.evaluate(async () => {
    const P = window.__PROBE;
    const car = P.amusement.bumper[0];
    const frames = n => new Promise(r => { let i=0; const tick=()=>{ if(++i>=n) return r(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    const L = [];
    L.push('before board pos='+String(car.position.x)+','+String(car.position.z)+' rot='+String(car.rotation.y));
    P.toggleRideFacility({kind:'bumper', car, label:'冰面碰碰车'});
    for (let i=0;i<6;i++){
      await frames(1);
      const b = P.wheelSys.bump;
      L.push('f'+i+' pos='+String(car.position.x)+','+String(car.position.z)
        +' ang='+String(b&&b.ang)+' vx='+String(b&&b.vx)+' vz='+String(b&&b.vz)
        +' thr='+String(b&&b.thr)+' steer='+String(b&&b.steer)
        +' camY='+String(P.camera.position.y));
    }
    return L;
  });
  out.forEach(l => console.log(l));
  await b.close();
})();
