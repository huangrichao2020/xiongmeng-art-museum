/* 上线前冒烟：正常加载 → 开场 → 进馆 → 检查报错与帧率 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const pg = await (await b.newContext({ viewport:{width:1000,height:600} })).newPage();
  const errs=[];
  pg.on('pageerror', e=>errs.push(String(e).slice(0,200)));
  pg.on('console', m=>{ if(m.type()==='error') errs.push('[console] '+String(m.text()).slice(0,160)); });
  pg.on('requestfailed', r=>errs.push('[404?] '+r.url().slice(-70)));
  pg.on('response', r=>{ if(r.status()>=400) errs.push('['+r.status()+'] '+r.url().slice(-70)); });
  const t0=Date.now();
  await pg.goto('http://127.0.0.1:8899/', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.XM_TOUR, null, {timeout:180000});
  console.log('可交互', ((Date.now()-t0)/1000).toFixed(1),'秒');
  await pg.waitForTimeout(6000);
  await pg.screenshot({path:'/tmp/smoke_intro.png'});
  // 进入第一人称走一圈
  await pg.evaluate(()=>{ if(window.MP&&MP.enterWalk)MP.enterWalk(); });
  await pg.waitForTimeout(1500);
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(2500); await pg.keyboard.up('KeyW');
  await pg.waitForTimeout(1500);
  await pg.screenshot({path:'/tmp/smoke_walk.png'});
  const st = await pg.evaluate(()=>new Promise(res=>{
    let n=0; const t0=performance.now();
    const tick=()=>{ n++;
      if(performance.now()-t0<3000) requestAnimationFrame(tick);
      else { const T=window.XM_TOUR,i=T.renderer.info.render;
        res({fps:+(n/((performance.now()-t0)/1000)).toFixed(1),calls:i.calls,tris:i.triangles,
             cullList:T.DC.list.length, cullHidden:T.DC.list.filter(x=>x.hidden).length,
             lights:(()=>{let c=0;T.scene.traverse(o=>{if(o.isPointLight&&o.visible&&o.intensity>0.001)c++;});return c;})()});
      }};
    requestAnimationFrame(tick);
  }));
  console.log('走动后:', JSON.stringify(st));
  console.log('报错数:', errs.length); errs.slice(0,6).forEach(e=>console.log('  ',e));
  await b.close();
})();
