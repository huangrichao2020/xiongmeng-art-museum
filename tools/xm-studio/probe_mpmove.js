/* 让远端玩家连续移动，截多帧看挤压拉伸 + 名牌气泡 */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const cA=await b.newContext({viewport:{width:900,height:600}});
  const cB=await b.newContext({viewport:{width:900,height:600}});
  const A=await cA.newPage(), B=await cB.newPage();
  A.on('pageerror',e=>console.log('[A err]',String(e).slice(0,160)));
  B.on('pageerror',e=>console.log('[B err]',String(e).slice(0,160)));
  const url='https://preview.ai10088.com/alex-garage/';
  await A.goto(url,{waitUntil:'load',timeout:120000});
  await B.goto(url,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await B.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(5000); await B.waitForTimeout(5000);
  async function login(pg,acc){
    await pg.evaluate(()=>{const w=document.getElementById('mp-login');if(w)w.classList.remove('hide');});
    await pg.waitForSelector('#mp-acc');
    await pg.fill('#mp-acc',acc); await pg.fill('#mp-pass','123456');
    await pg.click('#mp-go');
  }
  await login(A,'test01'); await A.waitForTimeout(1200);
  await login(B,'test02'); await B.waitForTimeout(2000);
  // A 开第三人称，B 让 A 能看到自己 → 让 B 移动
  await A.evaluate(()=>MP.toggleThird());
  await A.waitForTimeout(2000);
  // 让 B 连续移动
  for(let i=0;i<40;i++){
    await B.evaluate(i=>MP.setLocalPos(Math.sin(i*.2)*4, 0, -2+Math.cos(i*.2)*4, i*.1), i);
    await B.waitForTimeout(70);
  }
  const st=await A.evaluate(()=>{
    const d=MP.debug();
    const k=Object.keys(d.peers)[0];
    return {peer:d.peers[k], self:d.selfPos};
  });
  console.log('A 看到的队友:',JSON.stringify(st));
  await A.screenshot({path:'/tmp/mp_moving.png'});
  await b.close();
})();
