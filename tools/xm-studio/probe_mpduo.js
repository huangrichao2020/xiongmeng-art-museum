/* 跨设备联机验证：电脑（桌面视口，test01）+ 手机（移动视口，test02）
   目标：① 双方在同一张地图、互相可见 ② 手机摇杆驱动移动 + 第三人称朝向
        ③ 位置实时同步到对方 ④ 双方第三人称相机正常 */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2]||'');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';

const login=async(pg,acc)=>{
  await pg.evaluate(()=>{const w=document.getElementById('mp-login');if(w)w.classList.remove('hide');});
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc',acc); await pg.fill('#mp-pass','123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2200);
};
/* 手机摇杆：按下 → 上推 → 保持 */
const stickPush=async(pg,dy)=>{
  await pg.evaluate((d)=>{
    const el=document.getElementById('joystick');
    const r=el.getBoundingClientRect();
    const cx=r.x+r.width/2, cy=r.y+r.height/2;
    const mk=(t,x,y)=>el.dispatchEvent(new PointerEvent(t,{pointerId:7,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true}));
    mk('pointerdown',cx,cy);
    mk('pointermove',cx,cy+d);
  },dy);
};
const stickRelease=async(pg)=>{
  await pg.evaluate(()=>{
    const el=document.getElementById('joystick');
    const r=el.getBoundingClientRect();
    const cx=r.x+r.width/2, cy=r.y+r.height/2;
    el.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,pointerType:'touch',isPrimary:true,clientX:cx,clientY:cy-48,bubbles:true,cancelable:true}));
  });
};
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const cD=await b.newContext({viewport:{width:1280,height:760}});                    // 电脑
  const cM=await b.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true,deviceScaleFactor:3,
    userAgent:'Mozilla/5.0 (Linux; Android 14; 23127PN0CC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'});
  const D=await cD.newPage(), M=await cM.newPage();
  D.on('pageerror',e=>console.log('[desk err]',String(e).slice(0,140)));
  M.on('pageerror',e=>console.log('[mob  err]',String(e).slice(0,140)));
  await D.goto(URL_,{waitUntil:'load',timeout:120000});
  await M.goto(URL_+'?mobile=1',{waitUntil:'load',timeout:120000});
  await D.waitForFunction(()=>window.MP,{timeout:120000});
  await M.waitForFunction(()=>window.MP,{timeout:120000});
  await D.waitForTimeout(6000); await M.waitForTimeout(6000);

  console.log('=== 登录 ===');
  await login(D,ACC.a);
  await login(M,ACC.b);
  await D.waitForTimeout(1500);
  console.log('桌面 peers:', JSON.stringify(await D.evaluate(()=>Object.keys(MP.peers))));
  console.log('手机 peers:', JSON.stringify(await M.evaluate(()=>Object.keys(MP.peers))));

  console.log('=== 双方开第三人称 ===');
  await D.evaluate(()=>MP.toggleThird());
  await M.evaluate(()=>{const b=document.getElementById('w-third'); if(b)b.click();});
  await D.waitForTimeout(2000);
  const camOf=async(pg)=>pg.evaluate(()=>{
    const dbg=MP.debug();
    return {third:dbg.third, cam:dbg.camPos, selfVis:dbg.selfVisible,
            selfScreen:dbg.selfScreen, peers:Object.keys(dbg.peers)};
  });
  console.log('桌面:', JSON.stringify(await camOf(D)));
  console.log('手机:', JSON.stringify(await camOf(M)));

  console.log('=== 手机推摇杆走 1.5 秒 ===');
  const mBefore=await M.evaluate(()=>window.diorama.fp.get());
  await stickPush(M,-48);
  await M.waitForTimeout(1500);
  const mDuring=await M.evaluate(()=>({
    fp:window.diorama.fp.get(),
    rotY:+MP.self.rotation.y.toFixed(3),
    faceDir:[+Math.sin(MP.self.rotation.y).toFixed(3),+Math.cos(MP.self.rotation.y).toFixed(3)],
    bodyPosY:MP.self.userData.bodyGrp?+MP.self.userData.bodyGrp.position.y.toFixed(4):null,
    shoulder0X:MP.self.userData.shoulders?+MP.self.userData.shoulders[0].rotation.x.toFixed(3):null,
    cam:MP.debug().camPos
  }));
  console.log('手机移动前:', JSON.stringify(mBefore));
  console.log('手机移动中:', JSON.stringify(mDuring));
  await stickRelease(M);

  console.log('=== 桌面看到的手机角色位置 ===');
  const seenByDesk=await D.evaluate((acc)=>{
    const p=MP.peers.get(acc); if(!p)return null;   // peers 是 Map
    const g=p.group;
    return {display:p.display, groupPos:[+g.position.x.toFixed(2),+g.position.y.toFixed(2),+g.position.z.toFixed(2)],
            rotY:+g.rotation.y.toFixed(3),
            faceDir:[+Math.sin(g.rotation.y).toFixed(3),+Math.cos(g.rotation.y).toFixed(3)],
            bodyPosY:g.userData.bodyGrp?+g.userData.bodyGrp.position.y.toFixed(4):null,
            rawSpeed:p.rawSpeed!==undefined?+p.rawSpeed.toFixed(2):null,
            screen:p.tag.material.opacity};
  }, ACC.b);
  console.log('桌面看到的 '+ACC.b+':', JSON.stringify(seenByDesk));
  console.log('手机真实位置   :', JSON.stringify([mDuring.fp.x,mDuring.fp.y,mDuring.fp.z]));

  await D.screenshot({path:'/tmp/mp_duo_desk.png'});
  await M.screenshot({path:'/tmp/mp_duo_mobile.png'});
  await b.close();
})();
