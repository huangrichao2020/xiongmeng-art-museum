const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.__PROBE, { timeout:90000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const P = window.__PROBE; let pt=0, sp=0;
    P.scene.traverse(o=>{ if(o.isPointLight)pt++; if(o.isSpotLight)sp++; });
    return {pointLights:pt, spotLights:sp,
            calls:P.renderer.info.render.calls, tris:P.renderer.info.render.triangles,
            progs:P.renderer.info.programs?P.renderer.info.programs.length:-1};
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
