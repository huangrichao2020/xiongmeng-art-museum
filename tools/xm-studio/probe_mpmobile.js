/* 手机端验证：右上角工具条排布 + 第三人称按钮 + 视角切换不卡死 */
const { chromium, devices } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.PURL || 'https://preview.ai10088.com/alex-garage/') + '?mobile=1';
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c=await b.newContext({
    viewport:{width:393,height:873},          // 小米 14 逻辑分辨率
    isMobile:true, hasTouch:true, deviceScaleFactor:3,
    userAgent:'Mozilla/5.0 (Linux; Android 14; 23127PN0CC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
  });
  const A=await c.newPage();
  A.on('pageerror',e=>console.log('[err]',String(e).slice(0,160)));
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(7000);

  const st=async(tag)=>{
    const d=await A.evaluate(()=>{
      const f=window.diorama.fp.get(); const dbg=MP.debug();
      const bt=document.getElementById('w-third');
      const r=bt?bt.getBoundingClientRect():null;
      return {fpOn:f.on, cam:dbg.camPos, third:dbg.third, conn:dbg.connected,
              selfVis:dbg.selfVisible, label:bt?bt.dataset.label:null,
              btnRight:r?Math.round(r.right):null, btnTop:r?Math.round(r.top):null,
              winW:innerWidth};
    });
    console.log(tag, JSON.stringify(d)); return d;
  };
  const tap=async(id)=>{ await A.evaluate((i)=>{const b=document.getElementById(i); if(b)b.click();},id); await A.waitForTimeout(1300); };

  await st('初始      ');
  await A.screenshot({path:'/tmp/mp_mobile_1.png'});
  /* 登录页是否把工具条藏起来了 */
  const toolsVis = await A.evaluate(()=>{
    const t=document.getElementById('wtools');
    return {display:getComputedStyle(t).display, bodyCls:document.body.className};
  });
  console.log('登录页时工具条', JSON.stringify(toolsVis));
  /* 点「先逛逛」→ 登录页消失，工具条应该回来 */
  await A.evaluate(()=>{const b=document.getElementById('mp-skip'); if(b) b.click();});
  await A.waitForTimeout(1200);
  const toolsVis2 = await A.evaluate(()=>{
    const t=document.getElementById('wtools');
    return {display:getComputedStyle(t).display, bodyCls:document.body.className};
  });
  console.log('跳过登录后  ', JSON.stringify(toolsVis2));
  await A.screenshot({path:'/tmp/mp_mobile_skip.png'});
  await tap('w-third'); await st('点三人称  ');
  await A.screenshot({path:'/tmp/mp_mobile_2.png'});
  await tap('w-mode');  await st('点沙盘    ');
  await tap('w-mode');  await st('再点沉浸  ');
  await A.screenshot({path:'/tmp/mp_mobile_3.png'});
  await b.close();
})();
