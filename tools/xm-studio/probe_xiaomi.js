const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const MI_UA='Mozilla/5.0 (Linux; Android 13; M2012K11AC Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 XiaoMi/MiuiBrowser/17.3.5';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport:{width:393,height:873}, deviceScaleFactor:2.75, isMobile:true, hasTouch:true, acceptDownloads:true, userAgent:MI_UA });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('https://preview.ai10088.com/alex-garage/', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(3500);
  await p.tap('#w-rec');
  await p.waitForTimeout(4500);
  await p.tap('#w-rec');
  await p.waitForTimeout(4500);
  const card = await p.evaluate(() => {
    const box=document.getElementById('recpv');
    return { shown: box.classList.contains('show'),
             tip: document.getElementById('recpv-tip').innerText.slice(0,90),
             shareVisible: document.getElementById('recpv-share').style.display,
             msg: document.getElementById('xmsg').textContent };
  });
  console.log('卡片:', JSON.stringify(card));
  await p.screenshot({ path:'/tmp/recchk/mi_card.png' });
  if (card.shown) {
    const dl = p.waitForEvent('download', { timeout: 25000 });
    await p.tap('#recpv-save');
    const d = await dl;
    const f = '/tmp/rectest/mi_'+d.suggestedFilename();
    await d.saveAs(f);
    console.log('点「保存到本机」→ 下载成功:', d.suggestedFilename(), fs.statSync(f).size, 'bytes');
  }
  await b.close();
})();
