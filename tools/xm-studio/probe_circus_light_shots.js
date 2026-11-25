/* 同机位拍 3 档灯光配置（3盏 / 篷顶+观众后 / 只篷顶），供肉眼比对 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const pg = await ctx.newPage();
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});
  await pg.evaluate(()=>{
    window.__L=[];
    window.diorama.scene().traverse(o=>{
      if(o.isPointLight && o.userData && o.userData.lpFixed){
        const p=o.getWorldPosition(new (window.diorama.scene().position.constructor)());
        if(Math.hypot(p.x-50,p.z-30)<12) window.__L.push(o);
      }
    });
  });
  await pg.evaluate(()=>{const el=document.getElementById('hour'); el.value='21.5'; el.dispatchEvent(new Event('input'));});
  await pg.waitForTimeout(1000);
  const setOn = m=>pg.evaluate(k=>{ window.__L.forEach((l,i)=>{ l.visible=!!(k&(1<<i)); }); }, m);
  const shot = async (name,m,cam)=>{
    await setOn(m); await pg.waitForTimeout(900);
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), cam);
    await pg.waitForTimeout(1400);
    await pg.screenshot({path:'/tmp/cl_'+name+'.png'});
    console.log('shot', name);
  };
  const CAM=[50,4.5,22,50,2.5,30];
  await shot('3light',0b111,CAM);
  await shot('2light',0b101,CAM);
  await shot('1light',0b001,CAM);
  await shot('3light_aud',0b111,[50,3.0,36.6,50,1.0,26]);
  await shot('2light_aud',0b101,[50,3.0,36.6,50,1.0,26]);
  await setOn(0b111);
  await b.close();
})();
