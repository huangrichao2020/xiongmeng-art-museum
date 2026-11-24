/* 手机端保存卡片全链路体检（小米 UA）：
   录 → 停 → 卡片 → 点「保存到本机」→ 状态行有没有更新 / 下载有没有真触发 / 新标签能不能开 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const MI_UA='Mozilla/5.0 (Linux; Android 13; M2012K11AC Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 XiaoMi/MiuiBrowser/17.3.5';
const SITE=process.argv[2]||'http://127.0.0.1:8811/';
(async () => {
  fs.mkdirSync('/tmp/rectest',{recursive:true});
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport:{width:393,height:873}, deviceScaleFactor:2.75, isMobile:true, hasTouch:true, acceptDownloads:true, userAgent:MI_UA });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(3500);
  const env = await p.evaluate(() => ({
    canShare: typeof navigator.canShare==='function',
    canShareFile: (()=>{ try{ return navigator.canShare({files:[new File([new Blob(['x'],{type:'text/plain'})],'a.txt')]}); }catch(e){ return 'err:'+e.message; } })(),
    mp4: (window.MediaRecorder&&MediaRecorder.isTypeSupported)?MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E'):'n/a',
    mime: (window.MediaRecorder&&MediaRecorder.isTypeSupported)?MediaRecorder.isTypeSupported('video/webm;codecs=vp9'):'n/a'
  }));
  console.log('环境:', JSON.stringify(env));
  await p.tap('#w-rec');
  await p.waitForTimeout(4000);
  await p.tap('#w-rec');
  await p.waitForTimeout(4000);
  const card = await p.evaluate(() => {
    const box=document.getElementById('recpv');
    return { shown: box.classList.contains('show'),
             status: document.getElementById('recpv-status') ? document.getElementById('recpv-status').textContent.slice(0,80) : 'NO #recpv-status',
             statusOn: document.getElementById('recpv-status') ? document.getElementById('recpv-status').classList.contains('on') : false,
             share: document.getElementById('recpv-share').style.display,
             tab: document.getElementById('recpv-tab') ? document.getElementById('recpv-tab').style.display : 'NO BUTTON',
             xmsg: document.getElementById('xmsg').textContent.slice(0,80),
             xmsgZ: getComputedStyle(document.getElementById('xmsg')).zIndex,
             recpvZ: getComputedStyle(document.getElementById('recpv')).zIndex };
  });
  console.log('卡片:', JSON.stringify(card));
  await p.screenshot({ path:'/tmp/rectest/mi_card.png' });
  let dlName='(无下载事件)';
  try{
    const dl = p.waitForEvent('download', { timeout: 20000 });
    await p.tap('#recpv-save');
    const d = await dl;
    const f='/tmp/rectest/mi_'+d.suggestedFilename();
    await d.saveAs(f);
    dlName=d.suggestedFilename()+' ('+fs.statSync(f).size+' bytes)';
  }catch(e){ dlName='下载未触发: '+String(e).slice(0,80); }
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => ({
    status: document.getElementById('recpv-status').textContent.slice(0,120),
    statusOn: document.getElementById('recpv-status').classList.contains('on'),
    xmsg: document.getElementById('xmsg').textContent.slice(0,80)
  }));
  console.log('下载:', dlName);
  console.log('点完后的卡片状态:', JSON.stringify(after));
  await p.screenshot({ path:'/tmp/rectest/mi_after.png' });
  await b.close();
})();
