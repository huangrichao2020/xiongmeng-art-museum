/* 停机坪 + 直升机 + 乘坐全流程验收 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const pg = await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e).slice(0,300)));
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(9000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});
  const shot=async(name)=>{ await pg.screenshot({path:'/tmp/r_'+name+'.png'}); console.log('shot',name); };

  /* ① 白天近景 */
  await pg.evaluate(()=>{const el=document.getElementById('hour'); el.value='13'; el.dispatchEvent(new Event('input'));});
  await pg.waitForTimeout(1200);
  await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]),[46,2.6,58,52.5,1.4,50.5]);
  await pg.waitForTimeout(1400);
  await shot('heli_day');
  await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]),[52,4.0,40.5,52.5,1.8,50.5]);
  await pg.waitForTimeout(1400);
  await shot('heli_front');

  /* ② 登机 */
  /* freezeCam 会把 camera.position.lerp / lookAt 永久打成空函数，
     拍完定点图必须解除，否则乘坐视角的相机完全不动（直升机踩过这个坑）。 */
  console.log('unfreezeCam ->', await pg.evaluate(()=>window.MP.unfreezeCam()));
  console.log('enterWalk ->', await pg.evaluate(()=>window.diorama.enterWalk()));
  await pg.waitForTimeout(600);
  await pg.evaluate(()=>window.diorama.heliWalkTo(52,44));
  await pg.waitForTimeout(400);
  const near = await pg.evaluate(()=>{ const h=window.diorama.heli(); return h; });
  console.log('登机前 heli:',JSON.stringify(near));
  await pg.evaluate(()=>window.diorama.heliRide());
  await pg.waitForTimeout(1200);
  console.log('登机后 heli:',JSON.stringify(await pg.evaluate(()=>window.diorama.heli())));
  console.log('相机:',JSON.stringify(await pg.evaluate(()=>window.diorama.camPos())));
  await shot('spin');

  /* ③ 飞行：每 3 秒采一次状态 + 相机 */
  for(let i=0;i<8;i++){
    await pg.waitForTimeout(3000);
    const st=await pg.evaluate(()=>window.diorama.heli());
    const cam=await pg.evaluate(()=>window.diorama.camPos());
    console.log(`t+${(i+1)*3}s phase=${st.phase} rotor=${st.rotor} pos=(${st.x},${st.y},${st.z}) dist=${st.dist}/${st.len} cam=${JSON.stringify(cam)}`);
    if(i===1)await shot('fly1');
    if(i===4)await shot('fly2');
    if(st.phase==='idle'&&!st.riding)break;
  }
  /* ④ 等落地 */
  for(let i=0;i<20;i++){
    await pg.waitForTimeout(1500);
    const st=await pg.evaluate(()=>window.diorama.heli());
    if(!st.riding){ console.log('落地并下车 OK, phase=',st.phase); break; }
  }
  const fin=await pg.evaluate(()=>window.diorama.heli());
  console.log('最终 heli:',JSON.stringify(fin));
  console.log('errs:',errs.length?errs.join('|'):'none');
  await b.close();
})();
