/* 查篷布贴图 / UV 是否真的生效 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1100,height:700}, deviceScaleFactor:1})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE && window.__PROBE.SK, { timeout:120000 });
  await p.waitForTimeout(7000);
  const info = await p.evaluate(() => {
    const SK = window.__PROBE.SK;
    const out = {fab:null, meshes:[]};
    const tex = SK.M.fabric.map;
    out.fab = tex ? {w:tex.image.width,h:tex.image.height,wrapS:tex.wrapS,wrapT:tex.wrapT,
                      minFilter:tex.minFilter, needsUpdate:tex.needsUpdate, repeat:tex.repeat.toArray()} : 'NO MAP';
    // 把贴图画到页面上
    if(tex){
      const c=document.createElement('canvas');c.width=tex.image.width;c.height=tex.image.height;
      c.getContext('2d').drawImage(tex.image,0,0);
      c.style.cssText='position:fixed;left:10px;top:10px;z-index:99999;border:2px solid #0f0;width:512px;height:512px';
      document.body.appendChild(c);
    }
    window.__PROBE.scene.traverse(o=>{
      if(out.meshes.length>=4)return;
      if(o.isMesh && o.material && o.material.map===tex){
        const uv=o.geometry.attributes.uv;
        if(!uv){out.meshes.push({type:'nouv',name:o.name});return;}
        let u0=9,u1=-9,v0=9,v1=-9;
        for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);
          if(u<u0)u0=u; if(u>u1)u1=u; if(v<v0)v0=v; if(v>v1)v1=v;}
        out.meshes.push({count:uv.count,u0:+u0.toFixed(3),u1:+u1.toFixed(3),v0:+v0.toFixed(3),v1:+v1.toFixed(3),
                         pos:o.position.toArray().map(v=>+v.toFixed(2))});
      }
    });
    return out;
  });
  console.log(JSON.stringify(info,null,1));
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/fab_probe.png' });
  await b.close();
})();
