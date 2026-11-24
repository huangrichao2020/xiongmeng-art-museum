const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  p.on('pageerror',e=>console.log('[pageerror]',String(e).slice(0,200)));
  await p.goto(process.argv[2]||'https://preview.ai10088.com/alex-garage/',{waitUntil:'load',timeout:120000});
  await p.waitForFunction(()=>window.XM&&window.MP,{timeout:120000});
  await p.waitForTimeout(5000);
  const info=await p.evaluate(()=>{
    const el=document.getElementById('mp-login');
    const btn=document.getElementById('mp-go');
    const cs=el?getComputedStyle(el):null;
    const bs=btn?getComputedStyle(btn):null;
    const r=btn?btn.getBoundingClientRect():null;
    const cx=r?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2):null;
    return {
      hasLogin:!!el,
      cssZ:cs?cs.zIndex:null, display:cs?cs.display:null, pos:cs?cs.position:null,
      btnRect:r?[r.x|0,r.y|0,r.width|0,r.height|0]:null,
      btnZ:bs?bs.zIndex:null,
      elementAtBtnPoint:cx?cx.tagName+'#'+cx.id+'.'+cx.className:null,
      bodyChildren:[...document.body.children].map(c=>c.tagName+'#'+c.id).slice(0,20)
    };
  });
  console.log(JSON.stringify(info,null,2));
  await b.close();
})();
