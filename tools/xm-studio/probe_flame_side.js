const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const TAG = process.argv[3] || 'x';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1200,height:800}, deviceScaleFactor:1})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(8000);
  await p.evaluate(() => window.XM.shot('balloon-ground'));
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    const P = window.__PROBE, T = window.__THREE;
    const b = P.balloons[0];
    window.__hold = setInterval(() => { b.burn = 1.05; b.vy = 3.4; }, 16);
    const cam = P.camera;
    const tmp = new T.Vector3();
    const origCopy = cam.position.copy.bind(cam.position);
    const origLook = cam.lookAt.bind(cam);
    // 导演机位每帧覆写相机，这里把 copy/lookAt 接管掉，摆成燃烧器的正侧视
    cam.position.copy = (v) => {
      const bx = b.g.position.x, by = b.g.position.y, bz = b.g.position.z;
      return origCopy(tmp.set(bx + 6.0, by + 3.15, bz + 0.6));
    };
    cam.lookAt = (x, y, z) => {
      const bx = b.g.position.x, by = b.g.position.y, bz = b.g.position.z;
      return origLook(bx, by + 3.0, bz);
    };
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `/tmp/flame_${TAG}.png` });
  console.log('saved', TAG);
  await b.close();
})();
