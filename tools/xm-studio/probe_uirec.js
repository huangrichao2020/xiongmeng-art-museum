/* 走页面原生录制按钮：点一次开始，点第二次停止，读提示条 + 产出文件 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1, acceptDownloads:true });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(6000);
  await p.evaluate(() => window.XM.shot('balloon-above'));
  await p.waitForTimeout(2500);
  const dl = p.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await p.click('#w-rec');
  await p.waitForTimeout(6000);
  const msg = await p.evaluate(() => { const e = document.getElementById('xmsg'); return e ? e.textContent : '(无提示条)'; });
  console.log('录制中提示:', msg);
  await p.click('#w-rec');
  const d = await dl;
  if (d) {
    const out = '/tmp/uirec_' + d.suggestedFilename();
    await d.saveAs(out);
    console.log('下载文件:', out, fs.statSync(out).size, 'bytes');
  } else {
    console.log('没有触发下载');
    const card = await p.evaluate(() => { const e = document.getElementById('recpv'); return e ? e.className + ' | ' + (document.getElementById('recpv-status') ? document.getElementById('recpv-status').textContent : '') : '(无卡片)'; });
    console.log('保存卡片状态:', card);
  }
  await b.close();
})();
