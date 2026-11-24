/* 线上站点验收：只用页面公开的 XM 接口 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'https://preview.ai10088.com/alex-garage/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.XM.shots, { timeout:120000 });
  await p.waitForTimeout(9000);
  const err = await p.evaluate(() => window.XM.debug ? window.XM.debug() : null);
  console.log('页面状态:', JSON.stringify(err && err.state ? err.state : err).slice(0, 300));
  for (const s of ['balloon-above', 'museum-gate']) {
    await p.evaluate(x => window.XM.shot(x), s);
    await p.waitForTimeout(2500);
    const r = await p.evaluate(async () => {
      const times = []; let last = performance.now(); let i = 0;
      await new Promise(res => {
        const tick = () => { const now = performance.now(); times.push(now - last); last = now; if (++i >= 70) return res(); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      const a = times.slice(8).sort((x, y) => x - y);
      return { fps: +(1000 / a[Math.floor(a.length / 2)]).toFixed(1), fpsEl: (document.getElementById('fps') || {}).textContent };
    });
    console.log(s.padEnd(16), r.fps + 'fps (页面计数器 ' + r.fpsEl + ')');
  }
  const rec = await p.evaluate(async () => {
    const r = await window.XM.record({ shot: 'balloon-above', duration: 4 });
    return { ok: r.ok, mime: r.mime, size: r.size, recFps: r.recFps, dpr: r.dpr, error: r.error };
  });
  console.log('线上录制:', JSON.stringify(rec));
  console.log('页面错误:', errs.length ? errs.slice(0, 5) : '无');
  await b.close();
})();
