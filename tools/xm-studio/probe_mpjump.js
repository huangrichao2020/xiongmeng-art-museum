/* 跳跃动作验证：起跳 → 滞空 → 落地 三段
   采样角色根节点高度 / 身体纵向缩放 / 手臂角度 / 脚高度 / 名牌高度 */
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
  await A.evaluate(()=>{const w=document.getElementById('mp-login');if(w)w.classList.remove('hide');});
  await A.waitForSelector('#mp-acc');
  await A.fill('#mp-acc','test01'); await A.fill('#mp-pass','123456');
  await A.click('#mp-go');
  await A.waitForTimeout(2000);
  await A.evaluate(()=>MP.toggleThird());
  await A.waitForTimeout(2000);

  /* 逐帧采样 */
  await A.evaluate(()=>{
    window.__J=[];
    const T=window.MP.self;
    window.__JT=setInterval(()=>{
      const g=MP.self; if(!g)return;
      const body=g.userData.bodyGrp, sh=g.userData.shoulders, ft=g.userData.feet;
      window.__J.push({
        t:+performance.now().toFixed(0),
        y:+g.position.y.toFixed(3),
        sy:+body.scale.y.toFixed(3),
        sxz:+body.scale.x.toFixed(3),
        arm0:+sh[0].rotation.x.toFixed(2),
        armZ:+sh[0].rotation.z.toFixed(2),
        footY:+ft[0].position.y.toFixed(3),
        footTilt:+ft[0].rotation.x.toFixed(2),
        tagY:+g.userData.tag.position.y.toFixed(3)
      });
    },16);
  });
  await A.waitForTimeout(500);
  await A.evaluate(()=>{document.body.focus();});
  await A.keyboard.down('Space');
  await A.waitForTimeout(120);
  await A.keyboard.up('Space');
  await A.waitForTimeout(1500);
  const seq = await A.evaluate(()=>{clearInterval(window.__JT); return window.__J;});
  /* 打印关键帧 */
  console.log('总采样帧数:', seq.length);
  console.log('idx  y       sy     sxz    arm0   armZ   footY  footTilt tagY');
  const t0 = seq.length? seq[0].t : 0;
  seq.forEach((s,i)=>{
    if(i%3===0 || i===seq.length-1){
      console.log(String(i).padStart(3), String(s.y).padEnd(7), String(s.sy).padEnd(6), String(s.sxz).padEnd(6),
        String(s.arm0).padEnd(6), String(s.armZ).padEnd(6), String(s.footY).padEnd(6), String(s.footTilt).padEnd(8), s.tagY);
    }
  });
  const ys = seq.map(s=>s.y);
  const sys = seq.map(s=>s.sy);
  console.log('--- 汇总 ---');
  console.log('角色高度范围:', Math.min(...ys).toFixed(3), '~', Math.max(...ys).toFixed(3),
              '  离地峰值:', (Math.max(...ys)-ys[0]).toFixed(3), 'm');
  console.log('身体纵向 sy 范围:', Math.min(...sys).toFixed(3), '~', Math.max(...sys).toFixed(3));
  console.log('手臂角度范围:', Math.min(...seq.map(s=>s.arm0)).toFixed(2), '~', Math.max(...seq.map(s=>s.arm0)).toFixed(2));
  console.log('脚抬起范围:', Math.min(...seq.map(s=>s.footY)).toFixed(3), '~', Math.max(...seq.map(s=>s.footY)).toFixed(3));
  await A.screenshot({path:'/tmp/mp_jump.png'});
  await b.close();
})();
