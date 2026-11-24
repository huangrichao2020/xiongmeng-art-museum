const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport:{width:393,height:852}, deviceScaleFactor:3, isMobile:true, hasTouch:true, acceptDownloads:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('https://preview.ai10088.com/alex-garage/', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(3500);
  const dl = p.waitForEvent('download', { timeout: 90000 });
  await p.tap('#w-rec');
  await p.waitForTimeout(1500);
  const during = await p.evaluate(() => window.XM.debug());
  console.log('录制中 dpr=%s fps=%s', during.dpr, during.fps);
  await p.waitForTimeout(4000);
  await p.tap('#w-rec');
  const d = await dl;
  const f = path.join('/tmp/rectest', 'mobile_'+d.suggestedFilename());
  await d.saveAs(f);
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => ({ msg: document.getElementById('xmsg').textContent, dpr: window.XM.debug().dpr }));
  console.log('录制后 dpr=%s 提示=%s', after.dpr, after.msg);
  console.log('文件:', f, fs.statSync(f).size);
  await b.close();
})();
