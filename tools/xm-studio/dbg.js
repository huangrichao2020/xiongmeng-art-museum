const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_='https://preview.ai10088.com/alex-garage/';
const login=async(pg,acc)=>{
  await pg.evaluate(()=>{const w=document.getElementById('mp-login');if(w)w.classList.remove('hide');});
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc',acc); await pg.fill('#mp-pass','123456');
  await pg.click('#mp-go'); await pg.waitForTimeout(2200);
};
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c1=await b.newContext({viewport:{width:1280,height:760}});
  const c2=await b.newContext({viewport:{width:1280,height:760}});
  const A=await c1.newPage(), B=await c2.newPage();
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await B.goto(URL_,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await B.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(6000); await B.waitForTimeout(6000);
  await login(A,'test07'); await login(B,'test08');
  await A.waitForTimeout(2500);
  console.log('A debug:', JSON.stringify(await A.evaluate(()=>({
    conn:MP.connected, acc:MP.account, fp:window.diorama.fp.get(),
    manual:!!MP._manual, last:MP.lastSend, third:MP.third}))));
  console.log('B peers:', JSON.stringify(await B.evaluate(()=>{
    const p=MP.peers.get('test07');
    return p?{cur:p.cur, target:p.target, curJy:p.curJy, targetJy:p.targetJy, groupY:p.group.position.y}:'no peer';
  })));
  await b.close();
})();
