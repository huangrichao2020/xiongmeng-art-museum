const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  await p.goto(process.argv[2]||'https://preview.ai10088.com/alex-garage/',{waitUntil:'load',timeout:120000});
  await p.waitForFunction(()=>window.MP,{timeout:120000});
  await p.waitForTimeout(4000);
  const info=await p.evaluate(()=>{
    // 找所有匹配 #mp-login 的 CSS 规则
    const rules=[];
    for(const sheet of document.styleSheets){
      let rs;try{rs=sheet.cssRules;}catch(e){continue;}
      for(const r of rs){
        if(r.cssRules){ for(const rr of r.cssRules){ if(rr.selectorText&&rr.selectorText.includes('mp-login')) rules.push({sel:rr.selectorText,css:rr.cssText.slice(0,200), media:r.conditionText||''}); } }
        else if(r.selectorText&&r.selectorText.includes('mp-login')) rules.push({sel:r.selectorText,css:r.cssText.slice(0,200),media:''});
      }
    }
    const el=document.getElementById('mp-login');
    return {rules, inline:el?el.getAttribute('style'):null, outer:el?el.outerHTML.slice(0,200):null};
  });
  console.log(JSON.stringify(info,null,2));
  await b.close();
})();
