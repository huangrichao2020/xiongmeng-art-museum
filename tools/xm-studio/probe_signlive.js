/* 找出场景里街边小店的招牌贴图原图，直接贴到页面上看真实像素 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1100,height:700}, deviceScaleFactor:1})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(7000);
  const info = await p.evaluate(() => {
    const P = window.__PROBE;
    const found = [];
    P.scene.traverse(o => {
      const m = o.material;
      if (!m || !m.map || !m.map.image) return;
      const im = m.map.image;
      if (im.width === 512 && im.height === 96 && found.length < 3) {
        found.push({ w: im.width, h: im.height, flipY: m.map.flipY,
          colorSpace: m.map.colorSpace, minFilter: m.map.minFilter, genMips: m.map.generateMipmaps });
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        c.getContext('2d').drawImage(im, 0, 0);
        c.style.cssText = 'position:fixed;left:' + (10 + found.length * 520) + 'px;top:10px;z-index:99999;border:2px solid #0f0';
        document.body.appendChild(c);
      }
    });
    return found;
  });
  console.log(JSON.stringify(info, null, 1));
  await p.waitForTimeout(600);
  await p.screenshot({ path: '/tmp/sign_live.png' });
  await b.close();
})();
