/* 摸清马戏团东侧那块空地：范围内有哪些物件、地面/围栏在哪 */
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

  const info = await pg.evaluate(()=>{
    const sc=window.diorama.scene();
    const V=sc.position.constructor;
    const out={top:[],near:[],lights:0,ground:[]};
    sc.children.forEach(o=>{
      const p=new V(); o.getWorldPosition(p);
      const bb=new (window.THREE_BOX3||Object)();
      out.top.push({type:o.type,name:o.name||'',tag:(o.userData&&o.userData.tag)||'',
        x:+p.x.toFixed(1),y:+p.y.toFixed(1),z:+p.z.toFixed(1),
        children:o.children.length});
    });
    /* 范围内的小物件（近地 6m 内） */
    sc.traverse(o=>{
      if(!o.isMesh) return;
      const p=new V(); o.getWorldPosition(p);
      if(p.x>54 && p.x<82 && p.z>2 && p.z<56 && p.y<8){
        out.near.push({x:+p.x.toFixed(1),y:+p.y.toFixed(1),z:+p.z.toFixed(1),
          n:o.name||'',t:o.geometry&&o.geometry.type||'', tag:(o.userData&&o.userData.tag)||''});
      }
    });
    out.near=out.near.slice(0,80);
    return out;
  });
  console.log('顶层节点数', info.top.length);
  console.log(JSON.stringify(info.top.filter(t=>t.x>30||t.z>10), null, 0).slice(0,4000));
  console.log('--- 范围 x[54,82] z[2,56] 低处物件数', info.near.length);
  console.log(JSON.stringify(info.near).slice(0,3000));
  await b.close();
})();
