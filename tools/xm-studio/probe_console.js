const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({executablePath:EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader']});
  const ctx = await b.newContext({viewport:{width:1280,height:720}});
  const p = await ctx.newPage();
  p.on('console', m => console.log('[console.'+m.type()+']', m.text().slice(0,300)));
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,400)));
  await p.goto('https://preview.ai10088.com/alex-garage/', {waitUntil:'load', timeout:90000});
  await p.waitForTimeout(9000);
  const info = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    return {
      hasXM: !!window.XM,
      canvas: c ? {w:c.width,h:c.height,sw:c.clientWidth,sh:c.clientHeight} : null,
      ver: window.XM && window.XM.version,
      state: window.XM ? window.XM.state() : null
    };
  });
  console.log(JSON.stringify(info,null,2));
  await p.screenshot({path:'/tmp/xmchk2/live.png'});
  await b.close();
})();
