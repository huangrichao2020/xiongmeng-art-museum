/* 开场运镜视觉对比（剔除开/关） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  for(const mode of ['on','off']){
    const pg = await (await b.newContext({ viewport:{width:1000,height:600} })).newPage();
    pg.on('pageerror', e=>console.log('[err]',String(e).slice(0,160)));
    await pg.goto('http://127.0.0.1:8899/?ui'+(mode==='off'?'&nocull=1':''), { waitUntil:'load', timeout:180000 });
    await pg.waitForFunction(()=>window.MP&&window.XM_TOUR, null, {timeout:180000});
    await pg.evaluate(()=>{document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e=>e.style.display='none');});
    await pg.waitForTimeout(9000);
    for(const t of [0.8, 1.8, 2.8, 3.6]){
      await pg.evaluate(v=>{ const I=window.XM_TOUR.intro; I.active=true; I.t=v; }, t);
      await pg.waitForTimeout(220);
      await pg.evaluate(v=>{ const I=window.XM_TOUR.intro; I.t=v; }, t);
      await pg.waitForTimeout(120);
      await pg.screenshot({ path:`/tmp/intro_${mode}_${String(t).replace('.','_')}.png` });
    }
    console.log('intro shots done:', mode);
    await pg.close();
  }
  await b.close();
})();
