const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const OUT = '/tmp/rectest';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1, acceptDownloads:true });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  p.on('console', m => { if(m.type()==='error') console.log('[console.error]', m.text().slice(0,200)); });
  await p.goto('https://preview.ai10088.com/alex-garage/', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(3000);

  const before = await p.evaluate(() => window.XM.debug());
  console.log('录制前 dpr=%s fps=%s', before.dpr, before.fps);

  const dl = p.waitForEvent('download', { timeout: 90000 });
  await p.click('#w-rec');
  await p.waitForTimeout(1200);
  const during = await p.evaluate(() => window.XM.debug());
  console.log('录制中 dpr=%s fps=%s', during.dpr, during.fps);
  const btnLabel = await p.evaluate(() => document.getElementById('w-rec').dataset.label);
  console.log('按钮状态:', btnLabel);

  await p.waitForTimeout(5000);
  await p.click('#w-rec');           // 停止
  const d = await dl;
  const file = path.join(OUT, d.suggestedFilename());
  await d.saveAs(file);
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => ({ dpr: window.XM.debug().dpr, label: document.getElementById('w-rec').dataset.label,
    msg: document.getElementById('xmsg').textContent }));
  console.log('录制后 dpr=%s 按钮=%s 提示=%s', after.dpr, after.label, after.msg);
  console.log('下载文件:', file, fs.statSync(file).size, 'bytes');
  await b.close();
})();
