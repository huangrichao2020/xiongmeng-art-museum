/* 从空中往下打射线，生成地表覆盖图：区分 空雪地 / 马路 / 建筑 / 场地 */
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
    const THREE_R = window.__THREE__;
    // 用页面里的 three：通过某个 mesh 的构造函数拿到
    const anyMesh=null;
    let T=null;
    sc.traverse(o=>{ if(!T&&o.isMesh&&o.geometry&&o.geometry.boundingBox!==undefined) T=o.constructor; });
    // 退而求其次：从已有对象拿 Vector3 / Raycaster 构造
    const V=sc.position.constructor;
    // Raycaster 从 Object3D 里拿不到，改用 mp 暴露的?
    return {note:'need three'};
  });
  console.log(JSON.stringify(res));
  await b.close();
})();
