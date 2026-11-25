/* 干净 A/B：同一构建、同一浏览器、同一机位，交替开关 3 盏马戏团补光，
   每档测 3 轮取中位数，排除噪声。
   同时量观众席外圈小熊的亮度（相机放在帐篷内、朝对面观众看）。 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e).slice(0,220)));
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});
  await pg.evaluate(()=>{
    window.__L=[];
    window.diorama.scene().traverse(o=>{
      if(o.isPointLight && o.userData && o.userData.lpFixed){
        const p=o.getWorldPosition(new (window.diorama.scene().position.constructor)());
        if(Math.hypot(p.x-50,p.z-30)<12) window.__L.push(o);
      }
    });
  });
  const n = await pg.evaluate(()=>window.__L.length);
  console.log('受控补光灯数 =', n);

  const setOn = (m)=>pg.evaluate(k=>{ window.__L.forEach((l,i)=>{ l.visible=!!(k&(1<<i)); }); }, m);

  const measure = async ()=>{
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), [22,18,26,0,4,-6]);
    await pg.waitForTimeout(800);
    return await pg.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();
      const tick=()=>{n++; if(performance.now()-t0<3000) requestAnimationFrame(tick); else res(n/((performance.now()-t0)/1000));};
      requestAnimationFrame(tick);}));
  };
  const med = a=>{const s=[...a].sort((x,y)=>x-y);return +s[Math.floor(s.length/2)].toFixed(1);};

  const on=[], off=[];
  for(let i=0;i<3;i++){
    await setOn(0b111); await pg.waitForTimeout(600); on.push(await measure());
    await setOn(0b000); await pg.waitForTimeout(600); off.push(await measure());
  }
  console.log('3盏开 fps 三轮 =', on.map(v=>v.toFixed(1)).join(', '), ' 中位数', med(on));
  console.log('3盏关 fps 三轮 =', off.map(v=>v.toFixed(1)).join(', '), ' 中位数', med(off));
  console.log('3 盏点光源的净成本 ≈', (med(off)-med(on)).toFixed(1), 'fps');

  /* 观众区亮度：相机在帐篷内南侧，朝北看对面外圈小熊 */
  const analyzer = await ctx.newPage(); await analyzer.goto('about:blank');
  await pg.evaluate(()=>{const el=document.getElementById('hour'); el.value='21.5'; el.dispatchEvent(new Event('input'));});
  await pg.waitForTimeout(1000);
  const lum = async (cam, box) => {
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), cam);
    await pg.waitForTimeout(1300);
    const buf = await pg.screenshot();
    return await analyzer.evaluate(async ({d,box})=>{
      const img=new Image();
      await new Promise((r,j)=>{img.onload=r;img.onerror=j;img.src='data:image/png;base64,'+d;});
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const x=c.getContext('2d');x.drawImage(img,0,0);
      const px=x.getImageData(box[0],box[1],box[2],box[3]).data;
      let s=0,k=0,mx=0; for(let i=0;i<px.length;i+=4){const l=.299*px[i]+.587*px[i+1]+.114*px[i+2];s+=l;k++;if(l>mx)mx=l;}
      return {avg:+(s/k).toFixed(1),max:+mx.toFixed(0)};
    }, {d:buf.toString('base64'), box});
  };
  const CAM_AUD=[50,3.0,36.6, 50,1.0,26];
  for(const [name,mask] of [['3盏全开',0b111],['只开篷顶+观众后',0b101],['全关',0b000]]){
    await setOn(mask); await pg.waitForTimeout(600);
    const a = await lum(CAM_AUD,[380,300,380,280]);
    console.log(`观众区 ${name}: ${JSON.stringify(a)}`);
  }
  await setOn(0b111);
  await pg.screenshot({path:'/tmp/cc_aud.png'});
  console.log(errs.length?'ERR '+errs.join('|'):'no page errors');
  await b.close();
})();
