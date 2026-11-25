/* 上线前冒烟：默认第一人称模式 + 手机视口 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = process.env.LOCAL_URL || 'http://127.0.0.1:8899/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  for (const vp of [{ width: 1280, height: 860, n: 'desktop' }, { width: 393, height: 873, n: 'mobile' }]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.n === 'mobile', hasTouch: vp.n === 'mobile' });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('C:' + m.text().slice(0, 160)); });
    const t0 = Date.now();
    await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
    const tLoad = Date.now() - t0;
    await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
    await pg.waitForTimeout(7000);
    const fps = await pg.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
      requestAnimationFrame(tick);
    }));
    const st = await pg.evaluate(() => {
      const cc = document.getElementById('cleanClock');
      const rail = document.getElementById('rail');
      const cs = getComputedStyle(rail);
      const r = rail.getBoundingClientRect();
      const ccR = cc.getBoundingClientRect();
      return {
        body: document.body.className,
        railDisplay: cs.display, railXY: [Math.round(r.x), Math.round(r.y)],
        clock: cc.textContent, clockVisible: getComputedStyle(cc).display,
        clockRect: [Math.round(ccR.x), Math.round(ccR.y), Math.round(ccR.width)],
        perf: window.diorama.perf(),
        lp: window.diorama.lp ? 'has-lp' : 'no-lp',
      };
    });
    await pg.screenshot({ path: '/tmp/smoke_' + vp.n + '.png' });
    console.log(vp.n.padEnd(8), 'load=' + tLoad + 'ms fps=' + fps, JSON.stringify(st));
    if (errs.length) console.log('  ERR', errs.slice(0, 4).join(' | '));
    await ctx.close();
  }
  await b.close();
})();
