/* 参与渲染的灯清单（各机位） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const VIEWS = [['正门广场',[0,2.2,2,0,3.2,8]],['市集西列',[-30,2,-4,-36,1.6,-12]],['全景俯视',[0,150,70,0,0,0]]];
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const pg = await (await b.newContext({ viewport:{width:1280,height:760} })).newPage();
  pg.on('pageerror', e=>console.log('[err]',String(e).slice(0,160)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.XM_TOUR, null, {timeout:180000});
  await pg.evaluate(()=>{document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e=>e.style.display='none'); if(window.__fp)window.__fp.on=false; window.XM_TOUR.stopDirector();});
  await pg.waitForTimeout(8000);
  for(const [name,cam] of VIEWS){
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), cam);
    await pg.waitForTimeout(1500);
    const r = await pg.evaluate(()=>{
      const T=window.XM_TOUR; const out=[];
      T.scene.traverse(o=>{ if(o.isLight && o.visible && o.intensity>0.0001){
        const p=o.getWorldPosition(new T.THREE.Vector3());
        out.push({t:o.type,i:+o.intensity.toFixed(1),d:+(o.distance||0).toFixed(1),p:[p.x.toFixed(1),p.y.toFixed(1),p.z.toFixed(1)].join(','),slot:!!o.userData.lpSlot,fix:!!o.userData.lpFixed});
      }});
      const pts=out.filter(o=>o.t==='PointLight');
      return {out, pts:pts.length, total:out.length, ptsList:pts};
    });
    console.log(`\n=== ${name}：可见灯 ${r.total}，其中点光源 ${r.pts} ===`);
    r.ptsList.forEach(o=>console.log(`  点光 强度${String(o.i).padStart(7)} 半径${String(o.d).padStart(6)} @${o.p} ${o.slot?'[槽位]':''}${o.fix?'[固定]':''}`));
  }
  await b.close();
})();
