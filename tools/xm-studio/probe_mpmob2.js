/* 第三人称取景 + 手机端触屏视角灵敏度 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });

  /* ── 桌面：第三人称取景 ── */
  const c1 = await b.newContext({ viewport: { width: 1280, height: 760 } });
  const p1 = await c1.newPage();
  p1.on('pageerror', e => console.log('[err]', String(e).slice(0, 160)));
  await p1.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await p1.waitForFunction(() => window.MP, { timeout: 120000 });
  await p1.waitForTimeout(4000);
  await p1.fill('#mp-acc', 'test06'); await p1.fill('#mp-pass', '123456');
  await p1.click('#mp-go');
  await p1.waitForTimeout(2500);
  await p1.evaluate(() => { MP.toggleThird(); window.diorama.fp.set(0, .26, 12, 0); });
  await p1.waitForTimeout(2500);
  const d = await p1.evaluate(() => MP.debug());
  console.log('[第三人称]', JSON.stringify({ selfScreen: d.selfScreen, camPos: d.camPos, selfPos: d.selfPos }));
  await p1.screenshot({ path: '/tmp/mp_third_framing.png' });

  /* ── 手机：触屏拖动转视角的灵敏度 ── */
  const c2 = await b.newContext({
    viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  });
  const p2 = await c2.newPage();
  p2.on('pageerror', e => console.log('[err2]', String(e).slice(0, 160)));
  await p2.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await p2.waitForFunction(() => window.MP, { timeout: 120000 });
  await p2.waitForTimeout(4500);
  await p2.fill('#mp-acc', 'test07'); await p2.fill('#mp-pass', '123456');
  await p2.click('#mp-go');
  await p2.waitForTimeout(3000);
  /* 进沉浸模式 */
  await p2.evaluate(() => { const b = document.querySelector('#w-fp') || document.querySelector('[data-act="fp"]'); if (b) b.click(); });
  await p2.waitForTimeout(1500);
  const before = await p2.evaluate(() => ({ yaw: window.diorama.fp.get().yaw, on: window.diorama.fp.get().on }));
  /* 单指横向拖 120px */
  await p2.touchscreen.tap(200, 400);
  const cdp = await c2.newCDPSession(p2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 400 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 20, y: 400 }] });
    await p2.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p2.waitForTimeout(300);
  const after = await p2.evaluate(() => ({ yaw: window.diorama.fp.get().yaw, pitch: window.diorama.fp.get().pitch }));
  const dYaw = Math.abs(after.yaw - before.yaw);
  console.log('[手机触屏] 拖动120px 转角 =', (dYaw * 180 / Math.PI).toFixed(1), '度',
    '（旧灵敏度 .0045 → 32.3°，新 .0078 → 53.7°）');
  await p2.screenshot({ path: '/tmp/mp_mobile_view.png' });
  await b.close();
})();
