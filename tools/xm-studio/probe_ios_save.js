const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const IPHONE_UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  // 模拟「没有系统分享面板」的 iOS（老 Safari / 微信内置浏览器）
  const ctx = await b.newContext({ viewport:{width:393,height:852}, deviceScaleFactor:3, isMobile:true, hasTouch:true, acceptDownloads:true, userAgent:IPHONE_UA });
  await ctx.addInitScript(() => { try{ Object.defineProperty(navigator,'share',{get(){return undefined;}}); Object.defineProperty(navigator,'canShare',{get(){return undefined;}}); }catch(e){} });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('https://preview.ai10088.com/alex-garage/', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(3500);
  await p.tap('#w-rec');
  await p.waitForTimeout(4000);
  await p.tap('#w-rec');
  await p.waitForTimeout(4000);
  const card = await p.evaluate(() => {
    const box=document.getElementById('recpv'), v=document.getElementById('recpv-video'), b=document.getElementById('recpv-save');
    return { shown: box.classList.contains('show'), videoSrc: !!v.getAttribute('src'), btn: b.textContent,
             tip: document.getElementById('recpv-tip').textContent.slice(0,60), msg: document.getElementById('xmsg').textContent };
  });
  console.log('保存卡片:', JSON.stringify(card));
  await p.screenshot({ path:'/tmp/recchk/ios_card.png' });
  if (card.shown) {
    const dl = p.waitForEvent('download', { timeout: 20000 });
    await p.tap('#recpv-save');
    const d = await dl;
    const f = '/tmp/rectest/ios_'+d.suggestedFilename();
    await d.saveAs(f);
    console.log('点「保存到本机」后下载成功:', d.suggestedFilename(), fs.statSync(f).size, 'bytes');
  }
  await b.close();
})();
