/* 钢琴广场 v2：视觉 + 交互 + draw call 对照 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 180)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await pg.waitForTimeout(600);

  /* 同一机位：广场可见 / 隐藏，量 draw call 差值 */
  await pg.evaluate(() => window.diorama.fp.set(-37.4, 0, -13.2, Math.PI * 0.74, -0.02));
  await pg.waitForTimeout(2000);
  const withP = await pg.evaluate(() => window.diorama.perf());
  await pg.screenshot({ path: '/tmp/pv2_1_arrive.png' });
  await pg.evaluate(() => window.diorama.hide('piano'));
  await pg.waitForTimeout(1200);
  const without = await pg.evaluate(() => window.diorama.perf());
  await pg.evaluate(() => window.diorama.show('piano'));
  await pg.waitForTimeout(800);
  console.log('perf 有广场', JSON.stringify(withP));
  console.log('perf 无广场', JSON.stringify(without));
  console.log('差值 draw call =', withP.calls - without.calls);

  /* 各角度 */
  const shots = [
    ['a_bench', -37.9, 0, -12.9, Math.PI * 0.76, -0.04],
    ['b_key', -38.4, 0, -12.0, Math.PI * 0.72, -0.10],
    ['c_side', -41.2, 0, -10.9, Math.PI * 0.50, 0.02],
    ['d_sign', -36.6, 0, -12.4, Math.PI * 0.62, 0.04],
    ['e_far', -35.0, 0, -14.4, Math.PI * 0.80, 0.0],
  ];
  for (const [n, x, y, z, yaw, pitch] of shots) {
    await pg.evaluate(a => window.diorama.fp.set(a[0], a[1], a[2], a[3], a[4]), [x, y, z, yaw, pitch]);
    await pg.waitForTimeout(1400);
    await pg.screenshot({ path: '/tmp/pv2_' + n + '.png' });
  }
  /* 弹奏 */
  await pg.evaluate(() => window.diorama.fp.set(-38.2, 0, -12.4, Math.PI * 0.74, -0.05));
  await pg.waitForTimeout(600);
  await pg.keyboard.press('KeyE');
  await pg.waitForTimeout(420);
  console.log('after E', JSON.stringify(await pg.evaluate(() => window.diorama.piano())));
  await pg.screenshot({ path: '/tmp/pv2_f_keys.png' });
  await b.close();
})();
