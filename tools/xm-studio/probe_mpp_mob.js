const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts('m');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.PURL || 'https://preview.ai10088.com/alex-garage/') + '?mobile=1';
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c=await b.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true,deviceScaleFactor:3,
    userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'});
  const A=await c.newPage();
  A.on('pageerror',e=>console.log('[err]',String(e).slice(0,160)));
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(6000);
  await A.evaluate(()=>{const w=document.getElementById('mp-login');if(w)w.classList.remove('hide');});
  await A.waitForSelector('#mp-acc');
  await A.fill('#mp-acc',ACC.a); await A.fill('#mp-pass','123456');
  await A.click('#mp-go');
  await A.waitForTimeout(2500);
  await A.screenshot({path:'/tmp/mp_mob_closed.png'});
  await A.evaluate(()=>document.getElementById('mp-me-btn').click());
  await A.waitForTimeout(900);
  const d=await A.evaluate(()=>{
    const p=document.getElementById('mp-panel');
    const r=p.getBoundingClientRect();
    const body=p.querySelector('.mp-body').getBoundingClientRect();
    return {open:p.classList.contains('open'),panelW:Math.round(r.width),bodyH:Math.round(body.height),
            acc:document.getElementById('mp-acc-t').textContent, id:document.getElementById('mp-id-t').textContent};
  });
  console.log('手机展开:', JSON.stringify(d));
  await A.screenshot({path:'/tmp/mp_mob_open.png'});
  await b.close();
})();
