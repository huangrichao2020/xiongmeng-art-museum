/* 停机坪 + 直升机 + 马戏团让路 全面验收 */
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

  /* ① 马戏团地基 vs 马路：量所有马戏团物件离马路的距离 */
  const clr = await pg.evaluate(()=>{
    const sc=window.diorama.scene();
    const V=sc.position.constructor;
    /* 马路顶点（tag=street 的 ribbon） */
    let roadPts=null;
    sc.traverse(o=>{
      if(roadPts||!(o.isMesh&&o.userData&&o.userData.tag==='street'))return;
      const pos=o.geometry.attributes.position; const arr=[];
      const m=o.matrixWorld.elements;
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
        arr.push([m[0]*x+m[4]*y+m[8]*z+m[12], m[2]*x+m[6]*y+m[10]*z+m[14]]);
      }
      roadPts=arr;
    });
    if(!roadPts)return{err:'no road'};
    /* 马戏团组里所有 mesh 的世界坐标 */
    let circ=null;
    sc.traverse(o=>{ if(!circ&&o.isGroup&&o.userData&&o.userData.tag==='fair')circ=o; });
    // 直接找马戏团根（含 legL 的组）不好找，改用已知中心 50,30 的所有 mesh
    const pts=[];
    sc.traverse(o=>{
      if(!o.isMesh)return;
      const p=new V();o.getWorldPosition(p);
      if(Math.hypot(p.x-50,p.z-30)<22&&p.y<7){
        const pos=o.geometry.attributes.position;
        for(let i=0;i<Math.min(pos.count,400);i++){
          const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
          const m=o.matrixWorld.elements;
          pts.push([m[0]*x+m[4]*y+m[8]*z+m[12], m[2]*x+m[6]*y+m[10]*z+m[14]]);
        }
      }
    });
    let minD=1e9, minP=null;
    for(const a of pts){
      for(const b of roadPts){
        const d=Math.hypot(a[0]-b[0],a[1]-b[1]);
        if(d<minD){minD=d;minP=a;}
      }
    }
    return {minD:+minD.toFixed(2),minP:minP&&minP.map(v=>+v.toFixed(1)),pts:pts.length,road:roadPts.length};
  });
  console.log('马戏团几何到马路最近距离 =', JSON.stringify(clr), '(需要 > 0.5m 才算让开)');

  /* ② 停机坪 + 直升机 */
  const h = await pg.evaluate(()=>window.diorama.heli());
  console.log('heli 状态:', JSON.stringify(h));

  const shot=async(name,cam)=>{
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]),cam);
    await pg.waitForTimeout(1500);
    await pg.screenshot({path:'/tmp/hp_'+name+'.png'});
    console.log('shot',name);
  };
  await pg.evaluate(()=>{const el=document.getElementById('hour'); el.value='21.5'; el.dispatchEvent(new Event('input'));});
  await pg.waitForTimeout(1200);
  await shot('pad_night',[52,7,66,52,1.5,50.5]);
  await shot('heli_night',[46,2.4,58,52.5,1.4,50.5]);
  await pg.evaluate(()=>{const el=document.getElementById('hour'); el.value='13'; el.dispatchEvent(new Event('input'));});
  await pg.waitForTimeout(1200);
  await shot('pad_day',[52,7,66,52,1.5,50.5]);
  await shot('heli_day',[46,2.4,58,52.5,1.4,50.5]);
  await shot('circus_top',[50,62,30,50,0,30]);
  await shot('all_top',[20,110,40,20,0,40]);

  console.log(errs.length?'ERR '+errs.join('|'):'no page errors');
  await b.close();
})();
