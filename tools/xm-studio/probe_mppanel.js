/* 验证：个人信息默认收起 → 点「个人」才展开 → 账号/ID/改 ID 都在里面 */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c=await b.newContext({viewport:{width:1280,height:760}});
  const A=await c.newPage();
  A.on('pageerror',e=>console.log('[err]',String(e).slice(0,160)));
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(6000);

  const st=async(tag)=>{
    const d=await A.evaluate(()=>{
      const p=document.getElementById('mp-panel');
      const body=p?p.querySelector('.mp-body'):null;
      const btn=p?p.querySelector('#mp-me-btn'):null;
      return {
        panelShown:p?getComputedStyle(p).display:null,
        open:p?p.classList.contains('open'):null,
        bodyShown:body?getComputedStyle(body).display:null,
        btnText:btn?btn.textContent.trim():null,
        btnShown:btn?getComputedStyle(btn).display:null,
        acc:(document.getElementById('mp-acc-t')||{}).textContent,
        id:(document.getElementById('mp-id-t')||{}).textContent,
        cnt:(document.getElementById('mp-cnt')||{}).textContent,
        cntOn:(document.getElementById('mp-cnt')||{}).className,
        hasInput:!!document.getElementById('mp-name')
      };
    });
    console.log(tag, JSON.stringify(d)); return d;
  };

  await st('未登录    ');
  await A.evaluate(()=>{const w=document.getElementById('mp-login');if(w)w.classList.remove('hide');});
  await A.waitForSelector('#mp-acc');
  await A.fill('#mp-acc','test01'); await A.fill('#mp-pass','123456');
  await A.click('#mp-go');
  await A.waitForTimeout(2500);
  await st('登录后    ');
  await A.screenshot({path:'/tmp/mp_panel_closed.png'});

  await A.evaluate(()=>document.getElementById('mp-me-btn').click());
  await A.waitForTimeout(800);
  await st('点个人    ');
  await A.screenshot({path:'/tmp/mp_panel_open.png'});

  /* 改 ID */
  await A.fill('#mp-name','阿豹');
  await A.click('#mp-save');
  await A.waitForTimeout(1200);
  await st('改 ID 后  ');
  await A.screenshot({path:'/tmp/mp_panel_rename.png'});

  /* 再点收起 */
  await A.evaluate(()=>document.getElementById('mp-me-btn').click());
  await A.waitForTimeout(600);
  await st('再点收起  ');
  await b.close();
})();
