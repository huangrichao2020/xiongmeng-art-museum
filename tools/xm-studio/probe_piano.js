/* 钢琴广场：视觉 + 交互验证 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 180)));
  pg.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 180)); });
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await pg.waitForTimeout(600);
  console.log('piano state', JSON.stringify(await pg.evaluate(() => window.diorama.piano())));

  /* 1. 沙盘机位看广场（用 ?ui 逻辑：这里页面默认第一人称，freezeCam 会被 fp 接管）
        所以改用把玩家放到广场附近再截图 —— 第一人称视角 */
  await pg.evaluate(() => window.diorama.fp.set(-37.6, 0, -13.4, Math.PI * 0.72, -0.06));
  await pg.waitForTimeout(1800);
  await pg.screenshot({ path: '/tmp/pz_1_arrive.png' });
  await pg.evaluate(() => window.diorama.fp.set(-38.6, 0, -12.6, Math.PI * 0.78, -0.02));
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: '/tmp/pz_2_piano.png' });
  await pg.evaluate(() => window.diorama.fp.set(-40.6, 0, -13.6, Math.PI * 0.52, 0.06));
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: '/tmp/pz_3_wide.png' });

  /* 2. 交互：按 E 弹奏 */
  await pg.evaluate(() => window.diorama.fp.set(-38.4, 0, -12.5, Math.PI * 0.75, 0));
  await pg.waitForTimeout(700);
  const hudTxt = await pg.evaluate(() => {
    const h = document.querySelector('#train-hud') || document.getElementById('trainHud');
    const m = document.querySelector('#train-msg') || document.getElementById('trainMsg');
    const btn = document.querySelector('#train-btn') || document.getElementById('trainBtn');
    return { hud: h ? h.className : 'none', msg: m ? m.textContent : '', btn: btn ? btn.textContent : '' };
  });
  console.log('HUD', JSON.stringify(hudTxt));
  await pg.keyboard.press('KeyE');
  await pg.waitForTimeout(450);
  const s1 = await pg.evaluate(() => window.diorama.piano());
  console.log('after E: wglow=', JSON.stringify(s1.wglow), 'bglow=', JSON.stringify(s1.bglow), 'flash=', s1.flash, 'lightI=', s1.lightI);
  await pg.screenshot({ path: '/tmp/pz_4_keys.png' });
  await pg.waitForTimeout(2500);
  const s2 = await pg.evaluate(() => window.diorama.piano());
  console.log('after 2.5s: wglow nonZero=', s2.wglow.filter(v => v > 0).length, 'flash=', s2.flash, 'sweepY=', s2.sweepY);
  await pg.screenshot({ path: '/tmp/pz_5_after.png' });
  console.log('perf', JSON.stringify(await pg.evaluate(() => window.diorama.perf())));
  await b.close();
})();
