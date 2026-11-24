const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('https://preview.ai10088.com/alex-garage/', {waitUntil:'load', timeout:90000});
  await p.waitForFunction(() => window.XM && window.XM.debug, {timeout:90000});
  await p.waitForTimeout(2000);
  const r = await p.evaluate(async () => {
    const out = [];
    for (const shot of ['coaster-chase','fpv-chase']) {
      const res = window.XM.shot(shot);
      await new Promise(r => setTimeout(r, 2000));
      for (let i=0;i<3;i++){
        await new Promise(r => requestAnimationFrame(r));
        const d = window.XM.debug();
        out.push({shot, res, active:d.dir.active, dirShot:d.dir.shot,
          camPos:d.cam.pos, camDir:d.dir.camDir, look:d.dir.look, dirPos:d.dir.pos,
          tgt: shot.includes('fpv') ? d.facilities.fpv : d.facilities.coaster});
      }
    }
    return out;
  });
  for (const x of r) console.log(JSON.stringify(x));
  await b.close();
})();
