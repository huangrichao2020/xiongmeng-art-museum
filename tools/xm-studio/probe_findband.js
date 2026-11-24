const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  await p.goto('http://127.0.0.1:8811/',{waitUntil:'load',timeout:120000});
  await p.waitForFunction(()=>window.XM&&window.__PROBE,{timeout:120000});
  await p.waitForTimeout(9000);
  const out=await p.evaluate(()=>{
    const {scene,THREE}=window.__PROBE;
    const rows=[];
    scene.traverse(o=>{
      if(o.isMesh&&!o.isSprite&&o.material&&o.material.type==='MeshBasicMaterial'&&o.material.blending===THREE.AdditiveBlending&&o.material.color.getHexString()==='ffbe7a'){
        const par=o.geometry.parameters||{};
        const bb=new THREE.Box3().setFromObject(o);
        rows.push({w:par.width,h:par.height,pos:[o.position.x,o.position.y,o.position.z],
          bb:[+bb.min.x.toFixed(2),+bb.min.y.toFixed(2),+bb.min.z.toFixed(3),+bb.max.x.toFixed(2),+bb.max.y.toFixed(2),+bb.max.z.toFixed(3)],
          po:!!o.material.polygonOffset});
      }
    });
    return {total:rows.length, rows:rows.slice(0,40)};
  });
  console.log(JSON.stringify(out,null,2));
  await b.close();
})();
