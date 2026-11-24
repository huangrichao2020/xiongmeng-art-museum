const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1000,height:700}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.__PROBE && window.__PROBE.balloons, { timeout:120000 });
  await p.waitForTimeout(6000);
  const rows = await p.evaluate(() => {
    const P = window.__PROBE;
    const bb = P.balloons[0];
    let gore = null;
    bb.g.traverse(o => { if (!gore && o.material && o.material.map && o.material.emissiveMap) gore = o; });
    const g = gore.geometry, US = 10, VS = 20;
    const out = [];
    for (let v = 0; v <= VS; v++) { const i = v*(US+1); out.push([g.attributes.uv.array[i*2+1], g.attributes.position.array[i*3+1]]); }
    return out;
  });
  console.log('每行 (uv.v, localY):', JSON.stringify(rows));
  // 对照实验：把贴图换成上半红 / 下半蓝，看哪半气球变蓝
  await p.evaluate(() => {
    const P = window.__PROBE, T = window.__THREE;
    const bb = P.balloons[0];
    let gore = null;
    bb.g.traverse(o => { if (!gore && o.material && o.material.map && o.material.emissiveMap) gore = o; });
    const c = document.createElement('canvas'); c.width = 128; c.height = 1024;
    const x = c.getContext('2d');
    x.fillStyle = '#ff0000'; x.fillRect(0,0,128,512);
    x.fillStyle = '#0000ff'; x.fillRect(0,512,128,512);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    t.flipY = false;                       // 两种都试
    gore.material.map = t; gore.material.emissiveMap = t;
    gore.material.needsUpdate = true;
  });
  await p.evaluate(() => window.XM.shot('balloon-ground'));
  await p.waitForTimeout(3500);
  await p.screenshot({ path: '/tmp/bal_bandtest.png' });
  console.log('band test saved');
  await b.close();
})();
