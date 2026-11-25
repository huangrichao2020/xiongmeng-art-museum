/* 雨天出图：沙盘机位（?ui）+ 冻结相机，拍雪/雨对照 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 160)); });
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => { document.getElementById('mp-login') && (document.getElementById('mp-login').style.display = 'none'); });

  const shots = [
    { n: 'snow_day', hour: 13.2, rain: 0, cam: [22, 18, 26, 0, 4, -6] },
    { n: 'rain_day', hour: 13.2, rain: 1, cam: [22, 18, 26, 0, 4, -6] },
    { n: 'rain_night', hour: 21.5, rain: 1, cam: [22, 18, 26, 0, 4, -6] },
    { n: 'rain_close', hour: 21.5, rain: 1, cam: [-40.4, 4.2, -2.5, -40.4, 1.2, -12] },
    { n: 'rain_campus', hour: 21.5, rain: 1, cam: [4, 15, -33, 0, 15, -74] },
  ];
  for (const s of shots) {
    await pg.evaluate(({ hour, rain, cam }) => {
      window.diorama.setRain(rain);
      // 切时段
      const h = document.getElementById('hour');
      h.value = String(hour); h.dispatchEvent(new Event('input'));
      window.MP.freezeCam(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
      window.diorama.fov && window.diorama.fov(52);
    }, s);
    await pg.waitForTimeout(1400);
    await pg.screenshot({ path: '/tmp/' + s.n + '.png' });
    console.log('shot ' + s.n);
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 8).join('\n') : 'no errors');
  await b.close();
})();
