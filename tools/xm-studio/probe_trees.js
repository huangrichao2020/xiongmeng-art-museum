/* 路口那几棵树现在的状态 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const TAG = process.argv[2]||'x';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const pg = await (await b.newContext({ viewport:{width:800,height:500} })).newPage();
  pg.on('pageerror', e=>console.log('[err]',String(e).slice(0,160)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.XM_TOUR, null, {timeout:180000});
  await pg.evaluate(()=>{document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e=>e.style.display='none');});
  await pg.waitForTimeout(9000);
  const r = await pg.evaluate(()=>{
    const T=window.XM_TOUR, THREE=T.THREE;
    const cam=new THREE.Vector3(-14,2.2,14);
    const rows=[];
    T.scene.traverse(o=>{
      if(!o.isMesh)return;
      const g=o.geometry; if(!g||!g.attributes.position)return;
      if(!g.boundingSphere)g.computeBoundingSphere();
      const p=o.getWorldPosition(new THREE.Vector3());
      const d=p.distanceTo(cam);
      if(d>14)return;
      const sc=o.getWorldScale(new THREE.Vector3());
      const rad=g.boundingSphere.radius*Math.max(sc.x,sc.y,sc.z);
      const m=Array.isArray(o.material)?o.material[0]:o.material;
      rows.push({d:+d.toFixed(1), rad:+rad.toFixed(2), c:m&&m.color?'#'+m.color.getHexString():'?',
        vc:!!(m&&m.vertexColors), hasCol:!!g.attributes.color,
        tris:(g.index?g.index.count:g.attributes.position.count)/3,
        p:[p.x.toFixed(1),p.y.toFixed(1),p.z.toFixed(1)].join(',')});
    });
    rows.sort((a,b)=>a.d-b.d);
    return rows;
  });
  const fs=require('fs');
  fs.writeFileSync(`/tmp/trees_${TAG}.txt`, r.map(x=>`d=${x.d} r=${x.rad} ${x.c} vcol=${x.vc?1:0} geoCol=${x.hasCol?1:0} tris=${x.tris} @${x.p}`).join('\n'));
  console.log(`=== ${TAG} 路口 14m 内 mesh（${r.length}）→ /tmp/trees_${TAG}.txt ===`);
  await b.close();
})();
