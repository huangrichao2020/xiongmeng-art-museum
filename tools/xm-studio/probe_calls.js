const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2], TAG = process.argv[3];
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(9000);
  for (const s of ['balloon-ground','balloon-above']) {
    await p.evaluate((x) => window.XM.shot(x), s);
    await p.waitForTimeout(4000);
    const c = await p.evaluate(() => window.__PROBE.renderer.info.render.calls);
    console.log(TAG, s, 'draw calls =', c);
  }
  await b.close();
})();
