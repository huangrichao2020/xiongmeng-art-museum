/* 验收：背面窗户共面 / 手机摇杆尺寸与灵敏度 / 跳楼机空中操控 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });

  /* ── 1. 桌面：背面窗户是否还共面 ── */
  const p1 = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  p1.on('pageerror', e => console.log('[err]', String(e).slice(0, 160)));
  await p1.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await p1.waitForFunction(() => window.diorama && window.diorama.ray, { timeout: 120000 });
  await p1.waitForTimeout(4000);
  const r = await p1.evaluate(() => {
    const shopX = -14.6, backZ = -31.9;
    return {
      backWindow: window.diorama.ray(shopX - 1.20, 1.48, backZ - 6, shopX - 1.20, 1.48, backZ),
      frontWindow: window.diorama.ray(shopX - 1.50, 1.40, -28.3 + 6, shopX - 1.50, 1.40, -28.3),
      sideWindow: window.diorama.ray(-65.3 - 6, 1.70, -9.5 - 0.6, -65.3, 1.70, -9.5 - 0.6),
    };
  });
  for (const k of Object.keys(r)) {
    const h = r[k];
    let v = '✓ 只有一层';
    if (h.length >= 2) {
      const d = Math.abs(h[0].d - h[1].d);
      v = d < 0.02 ? `✗ 仍然共面（差 ${(d * 100).toFixed(1)}cm）` : `✓ 两层差 ${(d * 100).toFixed(1)}cm`;
    }
    console.log(`[${k}] 命中${h.length}层 ${v}`);
    console.log('   ', JSON.stringify(h));
  }
  await p1.evaluate(() => MP.freezeCam(-15.8, 2.2, -36.5, -15.8, 1.5, -31.6));
  await p1.waitForTimeout(900);
  await p1.screenshot({ path: '/tmp/mp_shop_back.png' });
  await p1.evaluate(() => MP.freezeCam(-17.2, 2.4, -26.6, -14.6, 1.6, -30.1));
  await p1.waitForTimeout(900);
  await p1.screenshot({ path: '/tmp/mp_shop_front.png' });

  /* ── 2. 手机：摇杆尺寸 + 灵敏度 + 跳楼机 ── */
  const c2 = await b.newContext({
    viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  });
  const p2 = await c2.newPage();
  p2.on('pageerror', e => console.log('[err2]', String(e).slice(0, 160)));
  await p2.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await p2.waitForFunction(() => window.diorama && window.diorama.joy, { timeout: 120000 });
  await p2.waitForTimeout(4500);
  await p2.fill('#mp-acc', 'test07'); await p2.fill('#mp-pass', '123456');
  await p2.click('#mp-go');
  await p2.waitForTimeout(2500);

  const joyBox = await p2.evaluate(() => {
    const r = document.getElementById('joystick').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
  });
  console.log('[摇杆尺寸]', JSON.stringify(joyBox));

  /* 按住摇杆中心往右推 30px，看输出 */
  const cdp = await c2.newCDPSession(p2);
  const jc = await p2.evaluate(() => {
    const r = document.getElementById('joystick').getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jc.cx, y: jc.cy }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jc.cx + 30, y: jc.cy }] });
  await p2.waitForTimeout(200);
  const joyOut = await p2.evaluate(() => window.diorama.joy());
  console.log('[摇杆推30px 输出]', JSON.stringify(joyOut), '（旧 R=40 → 0.75，新 R=33 → 0.91）');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  /* ── 3. 跳楼机：摇杆能否控方向 ── */
  await p2.evaluate(() => { window.diorama.ride('launch'); });
  await p2.waitForTimeout(200);
  const l0 = await p2.evaluate(() => window.diorama.launch());
  console.log('[跳楼机] 上车状态', JSON.stringify(l0));

  /* 等进入滑翔阶段 */
  let stage = '';
  for (let i = 0; i < 30; i++) {
    await p2.waitForTimeout(500);
    const l = await p2.evaluate(() => window.diorama.launch());
    stage = l.stage;
    if (l.stage === 'chute') break;
  }
  console.log('[跳楼机] 当前阶段', stage);

  /* 推摇杆向右，看水平速度是否变化 */
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jc.cx, y: jc.cy }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jc.cx + 30, y: jc.cy }] });
  const samples = [];
  for (let i = 0; i < 8; i++) {
    await p2.waitForTimeout(400);
    samples.push(await p2.evaluate(() => window.diorama.launch()));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const moved = samples[samples.length - 1];
  console.log('[跳楼机滑翔] 初始', JSON.stringify(samples[0]));
  console.log('[跳楼机滑翔] 末态', JSON.stringify(moved));
  console.log('   水平位移 Δz =', (moved.z - samples[0].z).toFixed(2), 'm，Δx =', (moved.x - samples[0].x).toFixed(2), 'm',
    (Math.abs(moved.z - samples[0].z) > 1 || Math.abs(moved.x - samples[0].x) > 1) ? '✓ 摇杆能控方向' : '✗ 方向没变');
  await p2.screenshot({ path: '/tmp/mp_launch_chute.png' });
  await b.close();
})();
