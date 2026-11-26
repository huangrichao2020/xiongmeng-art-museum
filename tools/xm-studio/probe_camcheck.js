const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const pg = await (await b.newContext({ viewport:{width:1280,height:760} })).newPage();
  pg.on('pageerror', e=>console.log('[err]',String(e).slice(0,160)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.XM_TOUR, null, {timeout:180000});
  const dump = async (tag)=>{
    const r = await pg.evaluate(()=>{
      const T=window.XM_TOUR, c=T.camera;
      let vm=0; T.scene.traverse(o=>{if(o.isMesh&&o.visible)vm++;});
      return {pos:[c.position.x,c.position.y,c.position.z].map(v=>+v.toFixed(1)),
        far:c.far, near:c.near, fov:c.fov, vm,
        calls:T.renderer.info.render.calls, tris:T.renderer.info.render.triangles,
        intro: window.__introState||null};
    });
    console.log(tag.padEnd(22), JSON.stringify(r));
  };
  await pg.evaluate(()=>{document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e=>e.style.display='none'); if(window.__fp)window.__fp.on=false;});
  await dump('t=0 刚加载');
  await pg.waitForTimeout(3000); await dump('t=3s');
  await pg.evaluate(()=>window.MP.freezeCam(0,150,70,0,0,0));
  await pg.waitForTimeout(1500); await dump('freezeCam 后 1.5s');
  await pg.waitForTimeout(10000); await dump('freezeCam 后 11.5s');
  await b.close();
})();
