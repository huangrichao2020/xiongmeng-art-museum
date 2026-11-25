/* 第一人称视角（用户实际看到的画面）：按时段连拍 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama && window.diorama.fp, null, { timeout: 180000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  const jobs = JSON.parse(process.env.JOBS || '[{"n":"fp_dusk","h":17.5,"rain":0,"pos":[0,1.7,16],"yaw":3.14}]');
  for (const j of jobs) {
    await pg.evaluate((j) => {
      window.diorama.setRain(j.rain);
      const el = document.getElementById('hour'); el.value = String(j.h); el.dispatchEvent(new Event('input'));
      window.diorama.fp.set(j.pos[0], j.pos[1], j.pos[2], j.yaw, j.pitch || 0);
    }, j);
    await pg.waitForTimeout(1800);
    await pg.screenshot({ path: '/tmp/' + j.n + '.png' });
    console.log('shot ' + j.n);
  }
  await b.close();
})();
