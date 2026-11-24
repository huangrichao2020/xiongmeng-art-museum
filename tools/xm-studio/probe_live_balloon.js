const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  p.on('console', m => { if (m.type()==='error') errs.push('[console]'+m.text().slice(0,160)); });
  await p.goto('https://preview.ai10088.com/alex-garage/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM, { timeout:120000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => window.XM.shot('balloon-ground'));
  await p.waitForTimeout(5000);
  await p.screenshot({ path: '/tmp/live_balloon.png' });
  console.log('线上页面错误:', errs.length ? errs.slice(0,5) : '无');
  console.log('线上机位 draw calls:', await p.evaluate(() => window.XM.debug().draw.calls));
  await b.close();
})();
