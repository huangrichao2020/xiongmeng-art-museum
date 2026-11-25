/* 加载耗时 A/B：同一个机位、同一个浏览器量 load 事件耗时 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const urls = process.argv.slice(2);
  for (const u of urls) {
    const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const t0 = Date.now();
    await pg.goto(u, { waitUntil: 'load', timeout: 180000 });
    const tLoad = Date.now() - t0;
    await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
    const tReady = Date.now() - t0;
    // 首帧真正画出来之后再多等一下量 FPS 稳定值
    await pg.waitForTimeout(3000);
    const perf = await pg.evaluate(() => window.diorama.perf());
    const nav = await pg.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0] || {};
      return { dcl: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0),
               resp: Math.round(n.responseEnd || 0) };
    });
    console.log(u.slice(0, 60) + ' | load=' + tLoad + 'ms ready=' + tReady + 'ms | DCL=' + nav.dcl +
                ' resp=' + nav.resp + ' | calls=' + perf.calls + ' tris=' + perf.tris + ' tex=' + perf.tex +
                ' | ' + (errs.length ? 'ERR ' + errs[0] : 'ok'));
    await b.close();
  }
})();
