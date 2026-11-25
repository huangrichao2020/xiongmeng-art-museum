/* 游乐园门口残留大构件逐个列出：是什么、什么材质、谁加的 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  const r = await pg.evaluate(()=>{
    const V=window.diorama.scene().position.constructor;
    const out=[];
    window.diorama.scene().traverse(o=>{
      if(!o.isMesh) return;
      const p=new V(); o.getWorldPosition(p);
      if(Math.hypot(p.x-4,p.z-19.9)>5.0) return;
      if(!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const rr=o.geometry.boundingSphere?o.geometry.boundingSphere.radius:0;
      if(rr<=1.5) return;
      // 往上找 4 层父级，拿到组名线索
      let chain=[], q=o;
      for(let i=0;i<5&&q;i++){ chain.push(q.name||q.type); q=q.parent; }
      out.push({
        pos:[+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1)],
        r:+rr.toFixed(2),
        geo:o.geometry.type,
        col:o.material&&o.material.color?o.material.color.getHexString():'-',
        chain:chain.join('<')
      });
    });
    return out;
  });
  r.forEach(x=>console.log(JSON.stringify(x)));
  await b.close();
})();
