/* 手机端第三人称：抬头角度是否还被硬截断 + 角色在屏幕上的位置 */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.PURL || 'https://preview.ai10088.com/alex-garage/') + '?mobile=1';
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c=await b.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true,deviceScaleFactor:3,
    userAgent:'Mozilla/5.0 (Linux; Android 14; 23127PN0CC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'});
  const M=await c.newPage();
  M.on('pageerror',e=>console.log('[err]',String(e).slice(0,160)));
  await M.goto(URL_,{waitUntil:'load',timeout:120000});
  await M.waitForFunction(()=>window.MP,{timeout:120000});
  await M.waitForTimeout(6000);
  await M.evaluate(()=>{const s=document.getElementById('mp-skip'); if(s)s.click();});
  await M.waitForTimeout(1000);
  await M.evaluate(()=>{const t=document.getElementById('w-third'); if(t)t.click();});
  await M.waitForTimeout(2000);

  const read=async(tag)=>{
    const d=await M.evaluate(()=>{
      const dbg=MP.debug();
      return {camPitchDeg:dbg.selfScreen?dbg.selfScreen.camPitchDeg:null,
              head:dbg.selfScreen?dbg.selfScreen.head:null,
              feet:dbg.selfScreen?dbg.selfScreen.feet:null,
              cam:dbg.camPos, fpPitch:+window.diorama.fp.get().yaw};
    });
    console.log(tag, JSON.stringify(d)); return d;
  };
  await M.evaluate(()=>{window.diorama.fp.set(0,.26,10.2,0,0);});
  await M.waitForTimeout(1500); await read('pitch=0    ');
  await M.evaluate(()=>{window.diorama.fp.set(0,.26,10.2,0,.9);});
  await M.waitForTimeout(2000); await read('pitch=+0.9 ');
  await M.screenshot({path:'/tmp/mp_phone_up.png'});
  await M.evaluate(()=>{window.diorama.fp.set(0,.26,10.2,0,-.9);});
  await M.waitForTimeout(2000); await read('pitch=-0.9 ');
  await M.screenshot({path:'/tmp/mp_phone_down.png'});
  await b.close();
})();
