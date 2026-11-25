/* 时段/天气定点出图（诊断用） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
const CAMS = {
  plaza: [22, 18, 26, 0, 4, -6],
  west: [-46, 12, 14, -40, 4, -2],
  fair: [34, 20, 42, 46, 6, 30],
  market: [-30, 10, 6, -22, 3, -12],
  church: [-30, 14, 48, -49, 8, 30],
};
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  const jobs = JSON.parse(process.env.JOBS || '[{"n":"dusk","h":17.5,"rain":0,"cam":"plaza"}]');
  for (const j of jobs) {
    await pg.evaluate(({ j, CAMS }) => {
      window.diorama.setRain(j.rain);
      const el = document.getElementById('hour'); el.value = String(j.h); el.dispatchEvent(new Event('input'));
      const c = CAMS[j.cam]; window.MP.freezeCam(c[0], c[1], c[2], c[3], c[4], c[5]);
    }, { j, CAMS });
    await pg.waitForTimeout(1600);
    await pg.screenshot({ path: '/tmp/' + j.n + '.png' });
    console.log('shot ' + j.n);
  }
  await b.close();
})();
