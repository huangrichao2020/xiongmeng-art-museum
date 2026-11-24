/* 验证：① 未联机也能切第三人称并正常走动
   ② 退出联机后「沉浸/沙盘」不再卡死
   ③ 沙盘视角下本地角色隐藏 */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2]||'');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c=await b.newContext({viewport:{width:900,height:600}});
  const A=await c.newPage();
  A.on('pageerror',e=>console.log('[err]',String(e).slice(0,160)));
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(6000);

  const st=async(tag)=>{
    const d=await A.evaluate(()=>{
      const f=window.diorama.fp.get(); const dbg=MP.debug();
      return {fpOn:f.on, cam:dbg.camPos, third:dbg.third, conn:dbg.connected,
              selfVis:dbg.selfVisible, btn:document.getElementById('w-third').dataset.label,
              hudBtn:(document.getElementById('mp-third')||{}).textContent};
    });
    console.log(tag, JSON.stringify(d)); return d;
  };
  const click=async(id)=>{ await A.evaluate((i)=>{const b=document.getElementById(i); if(b)b.click();},id); await A.waitForTimeout(1200); };

  console.log('=== D：未联机切第三人称 ===');
  await st('初始        ');
  await click('w-third'); await st('点三人称    ');
  await A.evaluate(()=>{document.body.focus();});
  await A.keyboard.down('KeyW'); await A.waitForTimeout(1200);
  const walkCam = await A.evaluate(()=>({
    cam:MP.debug().camPos,
    rotY:+MP.self.rotation.y.toFixed(3),
    faceDir:[+Math.sin(MP.self.rotation.y).toFixed(3),+Math.cos(MP.self.rotation.y).toFixed(3)],
    bodyPosY:MP.self.userData.bodyGrp?+MP.self.userData.bodyGrp.position.y.toFixed(4):null
  }));
  await A.keyboard.up('KeyW');
  console.log('走 1.2 秒后 ', JSON.stringify(walkCam));
  await A.screenshot({path:'/tmp/mp_solo_third.png'});

  console.log('=== E：第三人称下回沙盘 → 再进沉浸 ===');
  await click('w-mode'); await st('点沙盘      ');
  await click('w-mode'); await st('再点沉浸    ');

  console.log('=== F：联机第三人称 → 退出联机 → 切视角 ===');
  await A.evaluate(()=>{const w=document.getElementById('mp-login');if(w)w.classList.remove('hide');});
  await A.waitForSelector('#mp-acc');
  await A.fill('#mp-acc',ACC.a); await A.fill('#mp-pass','123456');
  await A.click('#mp-go');
  await A.waitForTimeout(2500);
  await click('w-third'); await st('联机三人称  ');
  await A.evaluate(()=>{const b=document.getElementById('mp-logout'); if(b) b.click();});
  await A.waitForTimeout(1500);
  await st('退出联机    ');
  await click('w-mode'); await st('点沙盘      ');
  await click('w-mode'); await st('再点沉浸    ');
  await A.screenshot({path:'/tmp/mp_after_logout.png'});
  await b.close();
})();
