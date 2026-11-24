const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_='https://preview.ai10088.com/alex-garage/';
const login=async(pg,acc)=>{
  await pg.evaluate(()=>{const w=document.getElementById('mp-login');if(w)w.classList.remove('hide');});
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc',acc); await pg.fill('#mp-pass','123456');
  await pg.click('#mp-go'); await pg.waitForTimeout(2500);
};
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c1=await b.newContext({viewport:{width:900,height:600}});
  const c2=await b.newContext({viewport:{width:900,height:600}});
  const A=await c1.newPage(), B=await c2.newPage();
  A.on('pageerror',e=>console.log('[A err]',String(e).slice(0,200)));
  B.on('pageerror',e=>console.log('[B err]',String(e).slice(0,200)));
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await B.goto(URL_,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await B.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(6000); await B.waitForTimeout(6000);
  await login(A,'test07');
  await login(B,'test08');
  await A.waitForTimeout(1500);
  for (const [tag,pg] of [['A',A],['B',B]]){
    const d=await pg.evaluate(()=>({conn:MP.connected, acc:MP.account, peers:[...MP.peers.keys()],
      kicked:!!MP._kicked, wsState:MP.ws?MP.ws.readyState:null, tries:MP.tries}));
    console.log(tag, JSON.stringify(d));
  }
  await b.close();
})();
