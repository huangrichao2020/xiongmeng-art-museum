const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(3500);
  await p.evaluate(() => window.XM.shot('balloon-above'));
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const rows = [];
    scene.children.forEach((root,i) => {
      let m=0, keep=0, inst=0;
      const sig=[];
      root.traverse(o=>{
        if(o.userData&&o.userData.keep)keep++;
        if(o.isInstancedMesh)inst++;
        if(o.visible&&(o.isMesh||o.isPoints||o.isLine)){
          m++;
          if(sig.length<3&&o.isMesh){
            const g=o.geometry, mt=o.material;
            sig.push(`${g.type}[${g.parameters?Object.values(g.parameters).slice(0,3).map(v=>typeof v==='number'?v.toFixed(2):v).join('/'):''}] ${mt.color?'#'+mt.color.getHexString():''} map=${!!mt.map}`);
          }
        }
      });
      if(m>=40) rows.push({i,tag:(root.userData&&root.userData.tag)||'',name:root.name||root.type,
        pos:root.position.toArray().map(v=>+v.toFixed(1)), m, keep, inst, sig});
    });
    rows.sort((a,b)=>b.m-a.m);
    return rows.slice(0,14);
  });
  r.forEach(x=>{ console.log(`#${x.i} ${x.name} tag=${x.tag||'-'} pos=${x.pos} mesh=${x.m} keep=${x.keep} inst=${x.inst}`); console.log('    '+x.sig.join('  |  ')); });
  await b.close();
})();
