/* 画面中心射线：镜头正前方挡着什么 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const TAG = process.argv[2]||'x';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const pg = await (await b.newContext({ viewport:{width:1000,height:600} })).newPage();
  pg.on('pageerror', e=>console.log('[err]',String(e).slice(0,160)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.XM_TOUR, null, {timeout:180000});
  await pg.evaluate(()=>{document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e=>e.style.display='none'); if(window.__fp)window.__fp.on=false; window.XM_TOUR.stopDirector();});
  await pg.waitForTimeout(9000);
  await pg.evaluate(()=>window.MP.freezeCam(-14,2.2,14,-2,4,6));
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate(()=>{
    const T=window.XM_TOUR, THREE=T.THREE;
    const cam=T.camera; cam.updateMatrixWorld(true); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const rc=new THREE.Raycaster();
    const out=[];
    for(const [nx,ny] of [[0,0],[-0.25,0],[-0.4,0.3],[0.3,-0.2]]){
      rc.setFromCamera(new THREE.Vector2(nx,ny), cam);
      const hits=rc.intersectObjects(T.scene.children,true).slice(0,4);
      out.push({ndc:[nx,ny], hits:hits.map(h=>{
        const o=h.object; const m=Array.isArray(o.material)?o.material[0]:o.material;
        let chain=[],q=o; for(let i=0;i<4&&q;i++){chain.push((q.userData&&q.userData.tag)||q.name||q.type);q=q.parent;}
        const g=o.geometry;
        return {d:+h.distance.toFixed(2), c:m&&m.color?'#'+m.color.getHexString():'?',
          vc:!!(m&&m.vertexColors), geoCol:!!(g&&g.attributes&&g.attributes.color),
          tri:g&&g.attributes.position?(g.index?g.index.count:g.attributes.position.count)/3:0,
          chain:chain.join('<'), pt:[h.point.x.toFixed(1),h.point.y.toFixed(1),h.point.z.toFixed(1)].join(',')};
      })});
    }
    return out;
  });
  console.log(`=== ${TAG} ===`);
  r.forEach(o=>{
    console.log(` NDC ${o.ndc.join(',')}`);
    o.hits.forEach(h=>console.log(`   d=${String(h.d).padStart(6)} 色${h.c} vcol=${h.vc?1:0} geoCol=${h.geoCol?1:0} ${String(h.tri).padStart(6)}面 @${h.pt}  ${h.chain}`));
  });
  await b.close();
})();
