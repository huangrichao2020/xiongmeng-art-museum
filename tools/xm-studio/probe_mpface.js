/* 验证：第三人称角色朝向是否随移动方向变化 + 走路动画
   用法：PURL=http://127.0.0.1:8811/ node probe_mpface.js
   PURL 不设则测线上 */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const cA=await b.newContext({viewport:{width:900,height:600}});
  const cB=await b.newContext({viewport:{width:900,height:600}});
  const A=await cA.newPage(), B=await cB.newPage();
  A.on('pageerror',e=>console.log('[A err]',String(e).slice(0,160)));
  B.on('pageerror',e=>console.log('[B err]',String(e).slice(0,160)));
  await A.goto(URL_,{waitUntil:'load',timeout:120000});
  await B.goto(URL_,{waitUntil:'load',timeout:120000});
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
  await A.evaluate(()=>MP.toggleThird());
  await A.waitForTimeout(2500);

  /* 采样器：连续记录名牌世界高度 + 身体组起伏
     不依赖 window.__THREE —— 线上页面没有探针注入 */
  async function startSample(pg){
    await pg.evaluate(()=>{
      window.__S={tagY:[],bodyY:[],scaleY:[],fpY:[],z:[]};
      window.__SI=setInterval(()=>{
        const g=MP.self; if(!g||!g.userData.tag) return;
        /* MP.self 直接挂在 scene 上 → 世界 y = 本地 y + 局部 y * scale.y */
        window.__S.tagY.push(+(g.position.y + g.userData.tag.position.y * g.scale.y).toFixed(4));
        /* 角色根节点高度（= 玩家脚下地面高度），用来分辨「地形起伏」还是「抖动」 */
        window.__S.fpY.push(+(window.diorama ? window.diorama.fp.get().y : 0).toFixed(4));
        window.__S.z.push(+g.position.z.toFixed(3));
        if(g.userData.bodyGrp)
          window.__S.bodyY.push(+(g.position.y + g.userData.bodyGrp.position.y * g.scale.y).toFixed(4));
        window.__S.scaleY.push(+g.scale.y.toFixed(4));
      },16);
    });
  }
  async function stopSample(pg){
    return await pg.evaluate(()=>{
      clearInterval(window.__SI);
      const S=window.__S; const out={};
      for(const k of ['tagY','bodyY','scaleY','fpY','z']){
        const a=S[k]; if(!a.length){out[k]=null;continue;}
        const mn=Math.min.apply(null,a), mx=Math.max.apply(null,a);
        out[k]={min:+mn.toFixed(4),max:+mx.toFixed(4),range:+(mx-mn).toFixed(4),n:a.length};
      }
      /* 逐样本序列：用来判断是「单调爬坡」还是「来回抖动」*/
      out.fpSeq=S.fpY.slice(0,60);
      out.zSeq=S.z.slice(0,60);
      return out;
    });
  }

  /* ── 本地角色 ── */
  await startSample(A);
  await A.evaluate(()=>{ document.body.focus(); });
  await A.keyboard.down('KeyW');
  await A.waitForTimeout(1400);
  const walkState = await A.evaluate(()=>{
    const g=MP.self;
    const ry=g.rotation.y; const faceDir=[+Math.sin(ry).toFixed(3),+Math.cos(ry).toFixed(3)];
    return {
      rotY:+g.rotation.y.toFixed(3),
      faceDir:faceDir,
      scale:[+g.scale.x.toFixed(3),+g.scale.y.toFixed(3)],
      bodyRotX: g.userData.bodyGrp? +g.userData.bodyGrp.rotation.x.toFixed(3):null,
      bodyPosY: g.userData.bodyGrp? +g.userData.bodyGrp.position.y.toFixed(4):null,
      shoulder0X: g.userData.shoulders? +g.userData.shoulders[0].rotation.x.toFixed(3):null,
      shoulder1X: g.userData.shoulders? +g.userData.shoulders[1].rotation.x.toFixed(3):null,
      tagScale:[+g.userData.tag.scale.x.toFixed(3),+g.userData.tag.scale.y.toFixed(3)]
    };
  });
  const localSample = await stopSample(A);
  console.log('走 1.4 秒后：', JSON.stringify(walkState,null,1));
  console.log('本地采样：', JSON.stringify(localSample));
  await A.screenshot({path:'/tmp/mp_face_walk.png'});
  await A.keyboard.up('KeyW');
  await A.waitForTimeout(1200);
  const idle = await A.evaluate(()=>{
    const g=MP.self;
    const ry=g.rotation.y; const faceDir=[+Math.sin(ry).toFixed(3),+Math.cos(ry).toFixed(3)];
    return {rotY:+g.rotation.y.toFixed(3),faceDir:faceDir};
  });
  console.log('停下后：', JSON.stringify(idle));
  await A.screenshot({path:'/tmp/mp_face_idle.png'});

  /* ── 远端角色：B 走，A 观察 ── */
  await B.evaluate(()=>{ document.body.focus(); });
  await B.keyboard.down('KeyW');
  await B.waitForTimeout(1500);
  const peerState = await A.evaluate(()=>{
    const p=[...MP.peers.values()][0]; if(!p) return null;
    const g=p.group, ry=g.rotation.y;
    return {
      rawSpeed: p.rawSpeed!==undefined? +p.rawSpeed.toFixed(3):null,
      rawDx: p.rawDx!==undefined? +p.rawDx.toFixed(4):null,
      rawDz: p.rawDz!==undefined? +p.rawDz.toFixed(4):null,
      rotY:+ry.toFixed(3),
      faceDir:[+Math.sin(ry).toFixed(3),+Math.cos(ry).toFixed(3)],
      bodyPosY: g.userData.bodyGrp? +g.userData.bodyGrp.position.y.toFixed(4):null,
      shoulder0X: g.userData.shoulders? +g.userData.shoulders[0].rotation.x.toFixed(3):null,
      scaleY:+g.scale.y.toFixed(4),
      tagScale:[+g.userData.tag.scale.x.toFixed(3),+g.userData.tag.scale.y.toFixed(3)]
    };
  });
  console.log('远端（B 在走）：', JSON.stringify(peerState));
  await A.screenshot({path:'/tmp/mp_peer_walk.png'});
  await B.keyboard.up('KeyW');
  await b.close();
})();
