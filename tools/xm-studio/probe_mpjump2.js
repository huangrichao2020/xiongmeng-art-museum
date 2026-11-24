/* 远端跳跃同步验证：A 跳 → B 看到 A 离地 + 滞空姿态 */
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
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c1=await b.newContext({viewport:{width:1280,height:760}});
  const c2=await b.newContext({viewport:{width:1280,height:760}});
  const A=await c1.newPage(), B=await c2.newPage();
  A.on('pageerror',e=>console.log('[A err]',String(e).slice(0,140)));
  B.on('pageerror',e=>console.log('[B err]',String(e).slice(0,140)));
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await B.goto(URL_,{waitUntil:'load',timeout:120000});
  await A.waitForFunction(()=>window.MP,{timeout:120000});
  await B.waitForFunction(()=>window.MP,{timeout:120000});
  await A.waitForTimeout(6000); await B.waitForTimeout(6000);
  await login(A,ACC.a); await login(B,ACC.b);
  await A.evaluate(()=>MP.toggleThird());
  await B.evaluate(()=>MP.toggleThird());
  await A.waitForTimeout(2500);
  /* 钩子：抓 A 发出的原始 pos 包 + B 收到的原始 move 包 */
  await A.evaluate(()=>{
    const old=MP.send.bind(MP);
    MP.send=(o)=>{ if(o.t==='pos') window.__SENT=(window.__SENT||[]).concat([JSON.parse(JSON.stringify(o.p))]); return old(o); };
  });
  await B.evaluate((acc)=>{
    const old=MP.onMsg.bind(MP);
    MP.onMsg=(m)=>{ if(m.t==='move'&&m.account===acc) window.__RECV=(window.__RECV||[]).concat([JSON.parse(JSON.stringify(m.p))]); return old(m); };
  }, ACC.a);
  /* 诊断：两端是否真的互相看见了 */
  for (const [tag,pg] of [['A',A],['B',B]]){
    const d=await pg.evaluate(()=>({conn:MP.connected, acc:MP.account,
      peers:[...MP.peers.keys()], kicked:!!MP._kicked, ws:MP.ws?MP.ws.readyState:null,
      fp:window.diorama.fp.get(), manual:!!MP._manual}));
    console.log(tag, JSON.stringify(d));
  }

  /* 让 A 和 B 面对面站近一点：B 站到 A 正前方 4m */
  await A.evaluate(()=>{ window.diorama.fp.set(0,.26,10.2,0,0); });
  await B.evaluate(()=>{ window.diorama.fp.set(0,.26,14.5,0,0); });
  await A.waitForTimeout(2000);

  /* B 端采样远端 test01 的状态 */
  await B.evaluate((acc)=>{
    window.__S=[];
    window.__SI=setInterval(()=>{
      const p=MP.peers.get(acc); if(!p||!p.group)return;
      const g=p.group, body=g.userData.bodyGrp, sh=g.userData.shoulders;
      window.__S.push({
        y:+g.position.y.toFixed(3),
        jy:+(p.curJy||0).toFixed(3),
        vy:+(p.curVy||0).toFixed(2),
        sy:+body.scale.y.toFixed(3),
        arm0:+sh[0].rotation.x.toFixed(2),
        footY:+g.userData.feet[0].position.y.toFixed(3)
      });
    },16);
  }, ACC.a);
  await B.waitForTimeout(400);
  await A.evaluate(()=>{document.body.focus();});
  await A.keyboard.down('Space'); await A.waitForTimeout(120); await A.keyboard.up('Space');
  await B.waitForTimeout(1600);
  const seq=await B.evaluate(()=>{clearInterval(window.__SI);return window.__S;});
  console.log('A 发出的 pos 包(最后3条):', JSON.stringify(await A.evaluate(()=>(window.__SENT||[]).slice(-3))));
  console.log('B 收到的 move 包(最后3条):', JSON.stringify(await B.evaluate(()=>(window.__RECV||[]).slice(-3))));
  console.log('B 看到的 test01 帧数:', seq.length);
  console.log('idx  y      jy     vy     sy    arm0   footY');
  seq.forEach((s,i)=>{ if(i%4===0||i===seq.length-1)
    console.log(String(i).padStart(3),String(s.y).padEnd(7),String(s.jy).padEnd(6),String(s.vy).padEnd(6),
      String(s.sy).padEnd(5),String(s.arm0).padEnd(6),s.footY); });
  const ys=seq.map(s=>s.y);
  console.log('--- 汇总 ---');
  console.log('远端角色高度范围:', Math.min(...ys).toFixed(3),'~',Math.max(...ys).toFixed(3),
              ' 离地峰值:',(Math.max(...ys)-ys[0]).toFixed(3),'m');
  console.log('远端身体 sy 范围:', Math.min(...seq.map(s=>s.sy)).toFixed(3),'~',Math.max(...seq.map(s=>s.sy)).toFixed(3));
  console.log('远端手臂角度范围:', Math.min(...seq.map(s=>s.arm0)).toFixed(2),'~',Math.max(...seq.map(s=>s.arm0)).toFixed(2));
  await B.screenshot({path:'/tmp/mp_jump_remote.png'});
  await b.close();
})();
