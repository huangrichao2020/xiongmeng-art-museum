const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport:{width:393,height:852}, deviceScaleFactor:3, isMobile:true, hasTouch:true, acceptDownloads:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
  p.on('console', m => { if(m.type()==='error') console.log('[err]', m.text().slice(0,200)); });
  await p.goto('https://preview.ai10088.com/alex-garage/', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(3500);
  const box = await p.evaluate(() => { const r=document.getElementById('w-rec').getBoundingClientRect(); const el=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2); return {r:{x:r.x,y:r.y,w:r.width,h:r.height}, top: el? (el.id||el.className||el.tagName):'none'}; });
  console.log('按钮位置', JSON.stringify(box));
  await p.tap('#w-rec');
  await p.waitForTimeout(2000);
  const st = await p.evaluate(() => ({ rec: window._recording, frames: window._uiRecFrames, msg: document.getElementById('xmsg').textContent, label: document.getElementById('w-rec').dataset.label }));
  console.log('点击后状态', JSON.stringify(st));
  await p.waitForTimeout(4000);
  await p.tap('#w-rec');
  await p.waitForTimeout(4000);
  const st2 = await p.evaluate(() => ({ rec: window._recording, frames: window._uiRecFrames, msg: document.getElementById('xmsg').textContent }));
  console.log('停止后状态', JSON.stringify(st2));
  await b.close();
})();
