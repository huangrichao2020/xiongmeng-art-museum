/* 马戏团东/南侧高分辨率俯视：确认哪块是真空地 */
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
    await pg.waitForTimeout(1500);
    await pg.screenshot({path:'/tmp/z_'+name+'.png'});
    console.log('shot', name);
  };
  // 相机高 35 → 竖向覆盖 2*35*tan30=40m(820px → 0.049m/px)，横向 59m
  await shot('es', [70,35,40, 70,0,40]);     // x 40..100, z 20..60
  await shot('s',  [58,35,55, 58,0,55]);    // x 28..88, z 35..75
  await shot('n',  [50,35,12, 50,0,12]);    // x 20..80, z -8..32
  await b.close();
})();
