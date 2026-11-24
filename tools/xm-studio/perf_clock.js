/* 钟楼上线后的性能与回归核对（手机视口 393x873） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const accs = pickAccounts('perf');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const errs = [];
  const ctx = await b.newContext({ viewport:{width:393,height:873}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
  const pg = await ctx.newPage();
  pg.on('pageerror', e=>errs.push(String(e).slice(0,200)));
  pg.on('console', m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,160)); });
  await pg.goto('https://preview.ai10088.com/alex-garage/?ui', { waitUntil:'load', timeout:120000 });
  await pg.waitForFunction(()=>window.MP,null,{timeout:120000});
  await pg.waitForTimeout(3000);
  await pg.evaluate((a)=>{const A=document.getElementById('mp-acc'),P=document.getElementById('mp-pass');
    if(A&&P){A.value=a;P.value='123456';document.getElementById('mp-go').click();}},accs.a);
  await pg.waitForFunction(()=>window.MP&&window.MP.connected,null,{timeout:30000}).catch(()=>{});
  await pg.waitForTimeout(4000);
  const perf = await pg.evaluate(()=>window.diorama.perf());
  await pg.evaluate(()=>window.diorama.clockShow(false));
  await pg.waitForTimeout(2500);
  const perfOff = await pg.evaluate(()=>window.diorama.perf());
  await pg.evaluate(()=>window.diorama.clockShow(true));
  await pg.waitForTimeout(2500);
  const perfOn = await pg.evaluate(()=>window.diorama.perf());
  console.log('A/B 隐藏钟楼 =', JSON.stringify(perfOff));
  console.log('A/B 显示钟楼 =', JSON.stringify(perfOn));
  const time = await pg.evaluate(()=>window.diorama.time());
  console.log('手机端 perf =', JSON.stringify(perf));
  console.log('手机端 时间 =', JSON.stringify(time));
  // 钟楼特写
  await pg.evaluate(()=>{ window.diorama.fov(52); window.MP.freezeCam(-49,15.9,17.6,-49,15.9,24.9); });
  await pg.waitForTimeout(1500);
  await pg.screenshot({path:'/tmp/clk_mobile.png'});
  console.log(errs.length?'ERRORS:\n'+errs.join('\n'):'no page errors');
  await b.close();
})();
