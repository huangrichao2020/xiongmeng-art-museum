/* 马戏团补光的性价比实测：
   把帐篷内 3 盏固定点光源分别关掉，量每一档的
     ① 广场机位 fps
     ② 帐篷内亮度（表演区机位 + 观众区机位，截图像素分析）
   数据说话：决定保留几盏。 */
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

  /* 找到马戏团那 3 盏固定补光（lpFixed 且在帐篷 12m 内） */
  const lamps = await pg.evaluate(()=>{
    const out=[];
    window.diorama.scene().traverse(o=>{
      if(o.isPointLight && o.userData && o.userData.lpFixed){
        const p=o.getWorldPosition(new (window.diorama.scene().position.constructor)());
        if(Math.hypot(p.x-50,p.z-30)<12) out.push({i:out.length,x:+p.x.toFixed(1),y:+p.y.toFixed(1),z:+p.z.toFixed(1),inten:o.intensity});
      }
    });
    return out;
  });
  console.log('找到马戏团固定补光:', JSON.stringify(lamps));

  /* 给三盏灯打上标记，方便后面开关 */
  await pg.evaluate(()=>{
    window.__L=[];
    window.diorama.scene().traverse(o=>{
      if(o.isPointLight && o.userData && o.userData.lpFixed){
        const p=o.getWorldPosition(new (window.diorama.scene().position.constructor)());
        if(Math.hypot(p.x-50,p.z-30)<12){ window.__L.push(o); }
      }
    });
  });

  await pg.evaluate(()=>{const el=document.getElementById('hour'); el.value='21.5'; el.dispatchEvent(new Event('input'));});
  await pg.waitForTimeout(1000);

  const analyzer = await ctx.newPage();
  await analyzer.goto('about:blank');
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
      let sum=0,n=0,mx=0,over=0;
      for(let i=0;i<px.length;i+=4){
        const l=.299*px[i]+.587*px[i+1]+.114*px[i+2];
        sum+=l;n++;if(l>mx)mx=l;if(l>240)over++;
      }
      return {avg:+(sum/n).toFixed(1),max:+mx.toFixed(0),over240:+(over/n*100).toFixed(2)};
    }, {d:buf.toString('base64'), box});
  };
  const fpsAt = async ()=>{
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), [22,18,26,0,4,-6]);
    await pg.waitForTimeout(900);
    return await pg.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();
      const tick=()=>{n++; if(performance.now()-t0<3500) requestAnimationFrame(tick); else res(+(n/((performance.now()-t0)/1000)).toFixed(1));};
      requestAnimationFrame(tick);}));
  };

  /* 表演区机位看画面中偏中下（熊和地板），观众区机位看外圈小熊 */
  const CAM_STAGE = [50,4.5,22,50,2.5,30];
  const CAM_AUD   = [50,5.0,40,50,2.0,28];
  const BOX_STAGE = [330,330,440,300];
  const BOX_AUD   = [380,330,400,300];

  const setOn = (mask)=>pg.evaluate(m=>{ window.__L.forEach((l,i)=>{ l.visible = !!(m & (1<<i)); }); }, mask);

  const cases = [
    ['3盏全开', 0b111],
    ['只开篷顶+前侧', 0b011],
    ['只开篷顶+观众后', 0b101],
    ['只开篷顶', 0b001],
    ['全关(对照)', 0b000],
  ];
  for(const [name,mask] of cases){
    await setOn(mask);
    await pg.waitForTimeout(700);
    const stage = await lum(CAM_STAGE, BOX_STAGE);
    const aud   = await lum(CAM_AUD, BOX_AUD);
    const f = await fpsAt();
    console.log(`${name}: 表演区亮度=${JSON.stringify(stage)} 观众区亮度=${JSON.stringify(aud)} plaza fps=${f}`);
  }
  await setOn(0b111);
  console.log(errs.length?'ERR '+errs.join('|'):'no page errors');
  await b.close();
})();
