/* 线上帧率 + 状态巡检 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  const CAMS = { plaza: [22, 18, 26, 0, 4, -6], market: [-30, 10, 6, -22, 3, -12] };
  for (const [name, c] of Object.entries(CAMS)) {
    await pg.evaluate((c) => window.MP.freezeCam(c[0], c[1], c[2], c[3], c[4], c[5]), c);
    await pg.waitForTimeout(2500);
    const fps = await pg.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); };
      requestAnimationFrame(tick);
    }));
    const info = await pg.evaluate(() => {
      const r = window.diorama ? window.diorama.renderer ? window.diorama.renderer.info : null : null;
      return { build: (document.querySelector('meta[name=xm-build]') || {}).content };
    });
    console.log(name, 'fps=' + fps, JSON.stringify(info));
  }
  await b.close();
})();
