/* 占位网格：马戏团周边哪些格子是空地 / 马路 / 城市背景 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 600 } });
  const pg = await ctx.newPage();
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});
  const res = await pg.evaluate(()=>{
    const sc=window.diorama.scene();
    const V=sc.position.constructor;
    const S=4; // 网格 4m
    const X0=20, X1=92, Z0=-8, Z1=72;
    const cells={};
    const key=(i,j)=>i+'_'+j;
    sc.traverse(o=>{
      if(!(o.isMesh||o.isGroup)) return;
      const p=new V(); o.getWorldPosition(p);
      if(p.y>6) return;                   // 高空物件不算占地
      const i=Math.floor((p.x-X0)/S), j=Math.floor((p.z-Z0)/S);
      if(i<0||j<0) return;
      if(i>(X1-X0)/S||j>(Z1-Z0)/S) return;
      const k=key(i,j);
      if(!cells[k]) cells[k]={n:0,tag:[],sample:[]};
      const c=cells[k];
      c.n++;
      const t=(o.userData&&o.userData.tag)||'';
      if(t && c.tag.indexOf(t)<0) c.tag.push(t);
      if(c.sample.length<3 && o.isMesh) c.sample.push(o.geometry&&o.geometry.type);
    });
    // 判断马路：road mesh 是 tag=street
    const road=[];
    sc.traverse(o=>{ if(o.isMesh && o.userData && o.userData.tag==='street') road.push(o.name); });
    return {S,X0,Z0,nx:Math.ceil((X1-X0)/S),nz:Math.ceil((Z1-Z0)/S),cells,roadMeshes:road.length};
  });
  console.log('road meshes', res.roadMeshes);
  let out='    ';
  for(let i=0;i<res.nx;i++) out += String(res.X0+i*res.S).padStart(4);
  out+='\n';
  for(let j=0;j<res.nz;j++){
    let line=String(res.Z0+j*res.S).padStart(4)+' ';
    for(let i=0;i<res.nx;i++){
      const c=res.cells[i+'_'+j];
      if(!c) line+='  .';
      else if(c.tag.indexOf('street')>=0) line+='  R';
      else if(c.n>=12) line+='  #';
      else if(c.n>=4) line+='  +';
      else line+='  o';
    }
    out+=line+'\n';
  }
  console.log(out);
  console.log('图例: . 空  o 少量(1-3)  + 中等(4-11)  # 密集(12+)  R 马路');
  await b.close();
})();
