const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
  let errs=0;
  p.on('console',m=>{if(m.type()==='error'){errs++;console.log('[err]',m.text().slice(0,240));}});
  p.on('pageerror',e=>{errs++;console.log('[pageerror]',String(e).slice(0,300));});
  p.on('requestfailed',r=>console.log('[404]',r.url()));
  p.on('response',r=>{if(r.status()>=400)console.log('[http'+r.status()+']',r.url());});
  await p.goto(process.argv[2]||'http://127.0.0.1:8811/',{waitUntil:'load',timeout:120000});
  await p.waitForFunction(()=>window.XM&&window.__PROBE,{timeout:120000});
  await p.waitForTimeout(10000);
  const shots=['church-front','theatre-front','market-lane','anime-plaza','balloon-ground','fair-gate'];
  for(const s of shots){
    await p.evaluate(x=>window.XM.shot(x),s);
    await p.waitForTimeout(2500);
    const c=await p.evaluate(()=>window.__PROBE.renderer.info.render.calls);
    console.log(s,'calls=',c);
    await p.screenshot({path:'/tmp/reg_'+s+'.png'});
  }
  console.log('errors=',errs);
  await b.close();
})();
