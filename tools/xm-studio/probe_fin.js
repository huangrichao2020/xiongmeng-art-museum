/* 门楼拆除后全景 + 性能 + 雪人复核 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});

  const cams = {
    plaza:   [22, 18, 26, 0, 4, -6],
    fairgate:[-6, 6.5, 26, 4, 2.6, 20],
    market:  [-30, 10, 6, -22, 3, -12],
    street:  [-2, 3.0, 4, -8, 1.6, -10]
  };
  for (const [n,c] of Object.entries(cams)) {
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), c);
    await pg.waitForTimeout(1500);
    const p = await pg.evaluate(()=>window.diorama.perf());
    console.log(`${n}: calls=${p.calls} tris=${p.tris} lights=${p.lights}`);
    await pg.screenshot({ path:'/tmp/fin_'+n+'.png' });
  }
  // fps
  await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), cams.plaza);
  await pg.waitForTimeout(1000);
  const fps = await pg.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();
    const tick=()=>{n++; if(performance.now()-t0<4000) requestAnimationFrame(tick); else res(+(n/((performance.now()-t0)/1000)).toFixed(1));};
    requestAnimationFrame(tick);}));
  console.log('plaza fps =', fps);
  const cnt = await pg.evaluate(()=>{let n=0,sm=0;
    window.diorama.scene().traverse(o=>{ if(o.isGroup&&o.userData&&o.userData.legL&&o.userData.armL)n++;
      if(o.isGroup&&o.userData&&o.userData.isSnowman)sm++;});
    return {npc:n,snowman:sm};});
  console.log('人物总数 =',cnt.npc,' 雪人 =',cnt.snowman);
  console.log(errs.length?'ERR '+errs.join('|'):'no page errors');
  await b.close();
})();
