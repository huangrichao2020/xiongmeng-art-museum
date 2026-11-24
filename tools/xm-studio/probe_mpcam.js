/* 第三人称构图诊断：角色在屏幕上的高度占比 + 相机俯仰随 pitch 的变化 */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c=await b.newContext({viewport:{width:900,height:600}});
  const A=await c.newPage();
  A.on('pageerror',e=>console.log('[err]',String(e).slice(0,160)));
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(5000);
  await A.evaluate(()=>{const w=document.getElementById('mp-login');if(w)w.classList.remove('hide');});
  await A.waitForSelector('#mp-acc');
  await A.fill('#mp-acc','test01'); await A.fill('#mp-pass','123456');
  await A.click('#mp-go');
  await A.waitForTimeout(2500);
  await A.evaluate(()=>MP.toggleThird());
  await A.waitForTimeout(2500);

  async function shot(tag){
    const d = await A.evaluate(()=>{
      const dbg=MP.debug();
      return {camPos:dbg.camPos, selfScreen:dbg.selfScreen, third:dbg.third};
    });
    console.log(tag, JSON.stringify(d));
    return d;
  }
  /* 站到空旷处正对 -Z */
  await A.evaluate(()=>{ window.diorama.fp.set(0,.26,10.2,0,0); });
  await A.waitForTimeout(1500);
  await shot('pitch=0   ');
  await A.screenshot({path:'/tmp/mp_cam_p0.png'});

  await A.evaluate(()=>{ window.diorama.fp.set(0,.26,10.2,0,.35); });
  await A.waitForTimeout(1500);
  await shot('pitch=+0.35');
  await A.screenshot({path:'/tmp/mp_cam_pup.png'});

  await A.evaluate(()=>{ window.diorama.fp.set(0,.26,10.2,0,-.35); });
  await A.waitForTimeout(1500);
  await shot('pitch=-0.35');
  await A.screenshot({path:'/tmp/mp_cam_pdn.png'});

  await b.close();
})();
