/* 验收：跳楼机空中方向控制（手机摇杆） */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const c=await b.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'});
  const pg=await c.newPage();
  pg.on('pageerror',e=>console.log('[err]',String(e).slice(0,160)));
  await pg.goto('https://preview.ai10088.com/alex-garage/',{waitUntil:'load',timeout:120000});
  await pg.waitForFunction(()=>window.diorama&&window.diorama.launch,{timeout:120000});
  await pg.waitForTimeout(4500);
  await pg.fill('#mp-acc','test07');await pg.fill('#mp-pass','123456');await pg.click('#mp-go');
  await pg.waitForTimeout(2500);
  await pg.evaluate(()=>window.diorama.ride('launch'));
  await pg.waitForTimeout(300);
  console.log('[上车]',JSON.stringify(await pg.evaluate(()=>window.diorama.launch())));
  const cdp=await c.newCDPSession(pg);
  const jc=await pg.evaluate(()=>{const r=document.getElementById('joystick').getBoundingClientRect();return{cx:r.x+r.width/2,cy:r.y+r.height/2};});
  // 立刻按住摇杆向右前推
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:jc.cx,y:jc.cy}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:jc.cx+30,y:jc.cy-30}]});
  const S=[];
  for(let i=0;i<24;i++){await pg.waitForTimeout(400);S.push(await pg.evaluate(()=>window.diorama.launch()));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const stages=[...new Set(S.map(x=>x.stage))];
  console.log('[阶段]',stages.join('→'));
  const ch=S.filter(x=>x.stage==='chute');
  if(ch.length>=2){
    const a=ch[0],z=ch[ch.length-1];
    console.log('[滑翔初]',JSON.stringify(a));
    console.log('[滑翔末]',JSON.stringify(z));
    console.log('  Δx=',(z.x-a.x).toFixed(2),'Δz=',(z.z-a.z).toFixed(2),
      (Math.abs(z.x-a.x)>1||Math.abs(z.z-a.z)>1)?'✓ 摇杆能控方向':'✗ 没变化');
  }
  const lz=S.filter(x=>x.stage==='launch');
  if(lz.length>=2){
    const a=lz[0],z=lz[lz.length-1];
    console.log('[上升段]',JSON.stringify(a),'→',JSON.stringify(z),' Δx=',(z.x-a.x).toFixed(2),'Δz=',(z.z-a.z).toFixed(2));
  }
  await pg.screenshot({path:'/tmp/mp_launch_chute.png'});
  await b.close();
})();
