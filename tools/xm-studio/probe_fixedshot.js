/* 固定相机截图：node probe_fixedshot.js <site> <out.png> [px,py,pz lx,ly,lz] */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2];
const OUT = process.argv[3];
const A = (process.argv[4] || '26.8,3.0,24 26.5,3.2,0').split(' ').map(s => s.split(',').map(Number));
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(7000);
  await p.evaluate((cam) => {
    const P = window.__PROBE;
    P.XM.stop();
    P.controls.autoRotate = false;
    P.camera.position.set(cam[0][0], cam[0][1], cam[0][2]);
    P.camera.lookAt(cam[1][0], cam[1][1], cam[1][2]);
    P.controls.target.set(cam[1][0], cam[1][1], cam[1][2]);
    P.controls.update();
  }, A);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT });
  console.log('saved', OUT);
  await b.close();
})();
