const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:1})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(8000);
  await p.evaluate(() => window.XM.shot('balloon-ground'));
  await p.waitForTimeout(4000);
  // 模拟满油门上升：燃烧器全开 + 上升速度
  await p.evaluate(() => {
    const P = window.__PROBE;
    const b = P.balloons[0];
    b.burn = 1.05; b.vy = 3.4;
    // 让上升状态别被 animate 拉回去：持续注入
    window.__hold = setInterval(() => { b.burn = 1.05; b.vy = 3.4; }, 16);
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: '/tmp/bs_burn.png' });
  await p.evaluate(() => clearInterval(window.__hold));
  console.log('saved burn shot');
  await b.close();
})();
