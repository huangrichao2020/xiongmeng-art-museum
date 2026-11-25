/* 马戏团四周的地面视角：找玩家说的那块大空地 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 620 } });
  const pg = await ctx.newPage();
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});
  await pg.evaluate(()=>{const el=document.getElementById('hour'); el.value='20.5'; el.dispatchEvent(new Event('input'));});
  await pg.waitForTimeout(1000);
  const shot = async (name, cam)=>{
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), cam);
    await pg.waitForTimeout(1400);
    await pg.screenshot({path:'/tmp/g_'+name+'.png'});
    console.log('shot', name);
  };
  await shot('west_in',  [36, 3.2, 30, 50, 3.0, 30]);   // 从正门（西）往东看
  await shot('east_out', [63, 3.2, 30, 90, 3.0, 30]);   // 从东侧往东看空地
  await shot('north_out',[50, 3.2, 20, 50, 3.0, 70]);   // 从北边往南看
  await shot('south_out',[50, 3.2, 44, 50, 3.0, 70]);   // 从南边往南看
  await b.close();
})();
