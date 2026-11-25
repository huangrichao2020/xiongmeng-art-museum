const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const errs=[]; pg.on('pageerror', e=>errs.push(String(e).slice(0,200)));
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  const r = await pg.evaluate(()=>{
    const V=window.diorama.scene().position.constructor;
    const list=[]; let n=0;
    window.diorama.scene().traverse(o=>{
      if(o.isGroup&&o.userData&&o.userData.isSnowman){
        n++; const p=new V(); o.getWorldPosition(p);
        list.push([+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1)]);
      }
    });
    // 游乐园门口残留大构件
    let gate=0;
    window.diorama.scene().traverse(o=>{
      if(!o.isMesh) return;
      const p=new V(); o.getWorldPosition(p);
      if(Math.hypot(p.x-4,p.z-19.9)<5.0){
        if(!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const rr=o.geometry.boundingSphere?o.geometry.boundingSphere.radius:0;
        if(rr>1.5) gate++;
      }
    });
    return { snowmen:n, list, gateBigParts:gate };
  });
  console.log('雪人总数 =', r.snowmen);
  console.log('位置:', JSON.stringify(r.list));
  console.log('游乐园门口残留大构件 =', r.gateBigParts);
  console.log(errs.length?'ERR '+errs.join('|'):'no errors');
  await b.close();
})();
