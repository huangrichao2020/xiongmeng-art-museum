const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1000,height:700}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.__PROBE && window.__PROBE.balloons, { timeout:120000 });
  await p.waitForTimeout(7000);
  const apply = (mode) => p.evaluate((mode) => {
    const P = window.__PROBE, T = window.__THREE;
    const c = document.createElement('canvas'); c.width = 128; c.height = 1024;
    const x = c.getContext('2d');
    x.fillStyle = '#101010'; x.fillRect(0,0,128,1024);
    if (mode === 'top') { x.fillStyle = '#ff00ff'; x.fillRect(0,0,128,512); }        // 画布上半
    if (mode === 'bot') { x.fillStyle = '#00ffff'; x.fillRect(0,512,128,512); }        // 画布下半
    if (mode === 'all') { x.fillStyle = '#ffff00'; x.fillRect(0,0,128,1024); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    P.balloons[0].g.traverse(o => {
      if (o.isMesh && o.material.map && o.material.emissiveMap) {
        o.material.map = t; o.material.emissiveMap = t; o.material.needsUpdate = true;
      }
    });
  }, mode);
  for (const mode of ['all','top','bot']) {
    await apply(mode);
    await p.evaluate(() => window.XM.shot('balloon-ground'));
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `/tmp/bal_half_${mode}.png` });
    console.log('saved', mode);
  }
  await b.close();
})();
