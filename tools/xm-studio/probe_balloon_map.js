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
  await p.evaluate(() => window.XM.shot('balloon-ground'));
  await p.waitForTimeout(3500);
  const info = await p.evaluate(() => {
    const P = window.__PROBE, V = window.__THREE.Vector3;
    const cam = P.camera;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const w = innerWidth, h = innerHeight;
    const rows = [];
    for (let y = 4.9; y <= 20.5; y += 0.5) {
      const v = new V(-49, y, 51).project(cam);
      rows.push([y, Math.round((-v.y*0.5+0.5)*h)]);
    }
    return { cam: cam.position.toArray().map(x=>+x.toFixed(2)), fov: cam.fov, rows, h, w };
  });
  console.log('相机位置', info.cam, 'fov', info.fov, '视口', info.w+'x'+info.h);
  console.log('世界高度 -> 屏幕y:', JSON.stringify(info.rows));
  await b.close();
})();
