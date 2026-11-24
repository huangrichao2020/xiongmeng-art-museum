const { chromium, devices } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport:{width:393,height:852}, deviceScaleFactor:3, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  await p.goto('https://preview.ai10088.com/alex-garage/', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(3500);
  const info = await p.evaluate(() => {
    const b = document.getElementById('w-rec');
    const r = b.getBoundingClientRect();
    const tools = document.getElementById('wtools').getBoundingClientRect();
    return { touch: document.body.classList.contains('touch'), rect:{x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)},
             tools:{x:+tools.x.toFixed(1),w:+tools.width.toFixed(1)}, label:b.dataset.label, dpr: window.XM.debug().dpr };
  });
  console.log(JSON.stringify(info));
  await p.screenshot({ path:'/tmp/recchk/mobile_top.png', clip:{x:0,y:0,width:393,height:120} });
  await b.close();
})();
