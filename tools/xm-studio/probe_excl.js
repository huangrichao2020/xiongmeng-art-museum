const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  await p.goto(process.argv[2] || 'http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => {
    const c = {};
    let ok = 0;
    window.__PROBE.scene.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material;
      let why = '';
      if (!m) why = 'nomat';
      else if (m.map) why = 'map';
      else if (m.emissiveMap || m.aoMap || m.normalMap || m.roughnessMap || m.metalnessMap || m.alphaMap || m.bumpMap) why = 'map2';
      else if (m.envMap) why = 'envMap';
      else if (m.transparent || m.opacity < 1) why = 'transparent';
      else if (m.onBeforeCompile) why = 'onBeforeCompile';
      else if (m.vertexColors) why = 'vcol';
      else if (m.isMeshBasicMaterial || m.isMeshStandardMaterial) { ok++; why = 'OK'; }
      else why = 'type:' + m.type;
      c[why] = (c[why] || 0) + 1;
    });
    return { c, ok };
  });
  console.log(JSON.stringify(r.c, null, 1), '可归族', r.ok);
  await b.close();
})();
