/* 钢琴广场最终验收：桌面多角度 + 手机 393x873 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  /* ── 桌面 ── */
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
  pg.on('pageerror', e => errs.push('desktop ' + String(e).slice(0, 160)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await pg.waitForTimeout(600);
  const shots = [
    ['far', -35.0, 0, -14.4, Math.PI * 0.80, 0.0],
    ['key', -37.9, 0, -12.9, Math.PI * 0.76, -0.06],
    ['side', -40.6, 0, -12.4, Math.PI * 0.30, 0.03],
    ['wide', -33.6, 0, -15.6, Math.PI * 0.86, 0.02],
  ];
  for (const [n, x, y, z, yaw, pitch] of shots) {
    await pg.evaluate(a => window.diorama.fp.set(a[0], a[1], a[2], a[3], a[4]), [x, y, z, yaw, pitch]);
    await pg.waitForTimeout(1400);
    await pg.screenshot({ path: '/tmp/pf_' + n + '.png' });
  }
  await pg.evaluate(() => window.diorama.fp.set(-38.2, 0, -12.4, Math.PI * 0.74, -0.05));
  await pg.waitForTimeout(500);
  await pg.keyboard.press('KeyE');
  await pg.waitForTimeout(400);
  const st = await pg.evaluate(() => window.diorama.piano());
  console.log('keys lit =', st.wglow.filter(v => v > 0).length, 'flash =', st.flash);
  await pg.screenshot({ path: '/tmp/pf_play.png' });
  console.log('perf', JSON.stringify(await pg.evaluate(() => window.diorama.perf())));
  await pg.close();

  /* ── 手机 ── */
  const mp = await (await b.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  mp.on('pageerror', e => errs.push('mobile ' + String(e).slice(0, 160)));
  await mp.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await mp.waitForFunction(() => window.MP, { timeout: 120000 });
  await mp.waitForTimeout(9000);
  await mp.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await mp.waitForTimeout(800);
  await mp.evaluate(() => window.diorama.fp.set(-37.9, 0, -12.9, Math.PI * 0.76, -0.06));
  await mp.waitForTimeout(1800);
  await mp.screenshot({ path: '/tmp/pf_mobile.png' });
  console.log('mobile perf', JSON.stringify(await mp.evaluate(() => window.diorama.perf())));
  await mp.close();

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
