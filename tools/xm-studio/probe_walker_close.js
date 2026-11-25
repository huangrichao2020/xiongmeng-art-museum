/* 钢丝熊近景：确认手臂朝外张开、看得见 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 640 } });
  const pg = await ctx.newPage();
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});
  await pg.evaluate(()=>{const el=document.getElementById('hour'); el.value='21.5'; el.dispatchEvent(new Event('input'));});
  await pg.waitForTimeout(1000);
  const w = await pg.evaluate(()=>{
    const c=window.diorama.circus();
    return c.walker?c.walker:null;
  });
  // 用场景里钢丝熊的真实世界坐标
  const pos = await pg.evaluate(()=>{
    let out=null;
    window.diorama.scene().traverse(o=>{
      if(o.isGroup && o.userData && o.userData.legL && o.userData.armL){
        const p=new (window.diorama.scene().position.constructor)();
        o.getWorldPosition(p);
        if(Math.abs(p.y-3.4)<0.4 && Math.hypot(p.x-50,p.z-30)<6) out=[p.x,p.y,p.z];
      }
    });
    return out;
  });
  console.log('钢丝熊世界坐标', JSON.stringify(pos));
  if(pos){
    const d=2.3; const cam=[pos[0]+d*0.707,pos[1]+0.55,pos[2]+d*0.707, pos[0],pos[1]+0.05,pos[2]];
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), cam);
    await pg.waitForTimeout(1500);
    await pg.screenshot({path:'/tmp/walker_side.png'});
    console.log('shot /tmp/walker_close.png');
  }
  await b.close();
})();
