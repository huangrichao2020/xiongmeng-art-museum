const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_='https://preview.ai10088.com/alex-garage/';
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c=await b.newContext({viewport:{width:900,height:600}});
  const A=await c.newPage();
  A.on('pageerror',e=>console.log('[PAGEERR]',String(e).slice(0,300)));
  A.on('console',m=>{ if(m.type()==='error') console.log('[CONSOLE]',m.text().slice(0,300)); });
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(6000);
  const r=await A.evaluate(()=>{
    try{
      const p=MP.addPeer({account:'zz',display:'zz',p:{x:0,y:0,z:0,yaw:0}});
      return {ok:true, size:MP.peers.size, hasGroup:!!(p&&p.group),
              feet:(p&&p.group.userData.feet)?p.group.userData.feet.length:null,
              shoulders:(p&&p.group.userData.shoulders)?p.group.userData.shoulders.length:null};
    }catch(e){ return {ok:false, err:String(e), stack:String(e&&e.stack).slice(0,400)}; }
  });
  console.log('addPeer 结果:', JSON.stringify(r,null,1));
  await b.close();
})();
