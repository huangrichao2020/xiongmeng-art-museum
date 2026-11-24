const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:1280,height:800}})).newPage();
  let errs=0;
  p.on('pageerror',e=>{errs++;console.log('[pageerror]',String(e).slice(0,200));});
  await p.goto('https://preview.ai10088.com/alex-garage/',{waitUntil:'load',timeout:120000});
  await p.waitForFunction(()=>window.XM&&window.XM.version,{timeout:120000});
  await p.waitForTimeout(9000);
  await p.evaluate(()=>window.XM.shot('market-lane'));
  await p.waitForTimeout(4000);
  await p.screenshot({path:'/tmp/live_market.png'});
  const st=await p.evaluate(()=>window.XM.state());
  console.log('errors=',errs,'fps=',st&&st.fps);
  await b.close();
})();
