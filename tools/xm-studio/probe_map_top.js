/* 俯视图：看清马戏团与马路、周边空地的关系 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 820 } });
  const pg = await ctx.newPage();
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});
  const shot = async (name, cam)=>{
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), cam);
    await pg.waitForTimeout(1400);
    await pg.screenshot({path:'/tmp/map_'+name+'.png'});
    console.log('shot', name);
  };
  await shot('se', [50, 62, 30, 50, 0, 30]);          // 马戏团正上方
  await shot('sewide', [45, 95, 30, 45, 0, 28]);      // 马戏团周边
  await shot('all', [0, 190, 60, 0, 0, 0]);            // 全场
  await b.close();
})();
