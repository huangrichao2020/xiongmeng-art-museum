/* 方位标定：在已知坐标放彩色标记，确认俯视图的 x/z 方向 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 820 } });
  const pg = await ctx.newPage();
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});
  await pg.evaluate(()=>{
    const sc=window.diorama.scene();
    // 找一个小球 mesh 当标记模板
    let tpl=null;
    sc.traverse(o=>{ if(!tpl&&o.isMesh&&o.geometry&&o.geometry.type==='SphereGeometry') tpl=o; });
    const marks=[
      {p:[50,1.2,52], c:0xff0000, name:'SOUTH_Z52'},   // 南
      {p:[72,1.2,30], c:0x00ff00, name:'EAST_X72'},     // 东
      {p:[50,1.2,8],  c:0x0000ff, name:'NORTH_Z8'},     // 北
      {p:[38,1.2,30], c:0xffff00, name:'WEST_X38'},     // 西
    ];
    window.__marks=[];
    for(const m of marks){
      const c=tpl.clone();
      c.position.set(m.p[0],m.p[1],m.p[2]);
      c.scale.setScalar(3.5);
      c.material=c.material.clone();
      c.material.color.setHex(m.c);
      c.material.emissive&&c.material.emissive.setHex(m.c);
      c.material.map=null;
      sc.add(c);
      window.__marks.push(c);
    }
    console.log('marks placed');
  });
  await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), [50,62,30,50,0,30]);
  await pg.waitForTimeout(1600);
  await pg.screenshot({path:'/tmp/orient.png'});
  console.log('shot /tmp/orient.png');
  await b.close();
})();
