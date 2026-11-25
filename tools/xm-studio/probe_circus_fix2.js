/* 马戏团修改后终验：
   1) 秋千熊 / 扔苹果熊 已彻底删除（旗杆下、表演位 225° 附近不再有熊）
   2) 三幕循环正常，报幕文案正确
   3) 帐篷内夜间亮度（用 screenshot 像素分析，避开 WebGL readback 问题）
   4) 钢丝熊手臂朝外
*/
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

  /* ── 1. 熊数量盘点 ── */
  const bears = await pg.evaluate(()=>{
    const V=window.diorama.scene().position.constructor;
    const list=[];
    window.diorama.scene().traverse(o=>{
      if(!(o.isGroup&&o.userData&&o.userData.legL&&o.userData.armL)) return;
      const p=new V(); o.getWorldPosition(p);
      list.push([+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1)]);
    });
    return list;
  });
  console.log('马戏团区内所有小熊世界坐标:', JSON.stringify(bears));
  const cx=50, cz=30;
  const inCircus = bears.filter(([x,y,z])=>Math.hypot(x-cx,z-cz)<11);
  console.log('马戏团 11m 内小熊数 =', inCircus.length);
  const nearPole = bears.filter(([x,y,z])=>Math.hypot(x-cx,z-cz)<1.2);
  console.log('旗杆中轴 1.2m 内小熊数 =', nearPole.length, '(应为 0)');
  const jugPos = bears.filter(([x,y,z])=>Math.hypot(x-(cx+Math.cos(225*Math.PI/180)*3.95), z-(cz+Math.sin(225*Math.PI/180)*3.95))<1.5);
  console.log('扔苹果位(225°)小熊数 =', jugPos.length, '(应为 0)');

  /* ── 2. 三幕循环 ── */
  const acts=new Set();
  for(let i=0;i<40;i++){
    acts.add(await pg.evaluate(()=>window.diorama.circus().actCn));
    await pg.waitForTimeout(700);
  }
  console.log('30 秒内出现过的节目:', JSON.stringify([...acts]));
  const st = await pg.evaluate(()=>window.diorama.circus());
  console.log('circus 状态:', JSON.stringify({act:st.act,actCn:st.actCn,apple0:st.apple0,trapZ:st.trapZ,walkerX:st.walkerX,spotOn:st.spotOn}));

  /* ── 3. 帐篷内亮度（screenshot 像素分析）── */
  const analyzer = await ctx.newPage();
  await analyzer.goto('about:blank');
  const brightness = async (tag, cam) => {
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), cam);
    await pg.waitForTimeout(1500);
    const buf = await pg.screenshot();
    return await analyzer.evaluate(async d=>{
      const img=new Image();
      await new Promise((r,j)=>{img.onload=r;img.onerror=j;img.src='data:image/png;base64,'+d;});
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const x=c.getContext('2d');x.drawImage(img,0,0);
      const px=x.getImageData(Math.floor(img.width*0.35),Math.floor(img.height*0.45),
        Math.floor(img.width*0.30),Math.floor(img.height*0.35)).data;
      let sum=0,n=0,mx=0,over240=0;
      for(let i=0;i<px.length;i+=4){
        const l=.299*px[i]+.587*px[i+1]+.114*px[i+2];
        sum+=l;n++;if(l>mx)mx=l;if(l>240)over240++;
      }
      return {avg:+(sum/n).toFixed(1),max:+mx.toFixed(0),over240pct:+(over240/n*100).toFixed(2)};
    }, buf.toString('base64'));
  };
  await pg.evaluate(()=>{const el=document.getElementById('hour'); el.value='21.5'; el.dispatchEvent(new Event('input'));});
  await pg.waitForTimeout(1200);
  const night = await brightness('n', [50,4.5,22,50,2.5,30]);
  console.log('帐篷内夜景亮度:', JSON.stringify(night));
  await pg.screenshot({path:'/tmp/cc_night.png'});
  await brightness('n', [50,6.0,14,50,3.6,30]);
  await pg.screenshot({path:'/tmp/cc_night2.png'});
  await brightness('n', [47,4.4,25,53,3.4,27]);
  await pg.screenshot({path:'/tmp/cc_wire.png'});
  await brightness('n', [44,3.2,26,50.5,3.0,30]);
  await pg.screenshot({path:'/tmp/cc_inside.png'});

  console.log(errs.length?'ERR '+errs.join('|'):'no page errors');
  await b.close();
})();
