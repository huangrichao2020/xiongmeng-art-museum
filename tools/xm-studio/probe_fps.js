/* 固定机位量帧率：同一浏览器、同一相机位置，A/B 用 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const CAMS = [
  { n: 'plaza', p: [9, 6.2, 20], t: [-2, 3.2, -6], fov: 64 },
  { n: 'campus', p: [4, 14, -34], t: [0, 16, -72], fov: 62 },
];
(async () => {
  for (const u of process.argv.slice(2)) {
    const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const pg = await ctx.newPage();
    await pg.goto(u + '?ui', { waitUntil: 'load', timeout: 180000 });
    await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
    await pg.waitForTimeout(3000);
    await pg.evaluate(() => { const l = document.getElementById('mp-login'); if (l) l.style.display = 'none'; });
    for (const c of CAMS) {
      await pg.evaluate((c) => { window.diorama.fov(c.fov); window.MP.freezeCam(c.p[0], c.p[1], c.p[2], c.t[0], c.t[1], c.t[2]); }, c);
      await pg.waitForTimeout(1500);
      const fps = await pg.evaluate(() => new Promise(res => {
        let n = 0; const t0 = performance.now();
        const tick = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
        requestAnimationFrame(tick);
      }));
      const perf = await pg.evaluate(() => window.diorama.perf());
      console.log(u.slice(0, 46).padEnd(47) + ' ' + c.n.padEnd(7) + ' fps=' + String(fps).padStart(3) +
                  ' calls=' + String(perf.calls).padStart(5) + ' tris=' + String(perf.tris).padStart(7));
    }
    await b.close();
  }
})();
