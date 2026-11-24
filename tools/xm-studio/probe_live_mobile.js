/* 线上手机端（小米 UA + 393×873 DPR2.75）验收：加载 + 录制按钮 + 保存卡片 */
const { chromium, devices } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'https://preview.ai10088.com/alex-garage/';
const XIAOMI_UA = 'Mozilla/5.0 (Linux; Android 13; 23127PN0CC Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 XiaoMi/MiuiBrowser/17.2.10';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({
    viewport: { width: 393, height: 873 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true,
    userAgent: XIAOMI_UA
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.XM.shots, { timeout:120000 });
  await p.waitForTimeout(9000);
  const st = await p.evaluate(() => ({ fps: (document.getElementById('fps') || {}).textContent, dpr: window.devicePixelRatio }));
  console.log('手机端页面状态:', JSON.stringify(st));
  await p.evaluate(() => window.XM.shot('balloon-above'));
  await p.waitForTimeout(2500);
  const rec = await p.evaluate(async () => {
    const r = await window.XM.record({ shot: 'balloon-above', duration: 3 });
    return { ok: r.ok, mime: r.mime, size: r.size, recFps: r.recFps, dpr: r.dpr, error: r.error };
  });
  console.log('手机端录制:', JSON.stringify(rec));
  console.log('页面错误:', errs.length ? errs.slice(0, 4) : '无');
  await b.close();
})();
