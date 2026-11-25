/* 手机端摇杆失灵排查：模拟触屏拖摇杆，看人物动不动 + 谁挡在前面 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 300)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/'), { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama && window.ECON, null, { timeout: 180000 });
  await pg.waitForTimeout(13000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  });
  await pg.waitForTimeout(1500);

  const info = await pg.evaluate(() => {
    const j = document.getElementById('joystick');
    const r = j.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const w = document.getElementById('wallet');
    const wr = w.getBoundingClientRect();
    return {
      touch: document.body.classList.contains('touch'),
      joyRect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      joyVisible: getComputedStyle(j).display,
      topAtJoy: top ? (top.id || top.tagName + '.' + top.className) : null,
      walletRect: [Math.round(wr.x), Math.round(wr.y), Math.round(wr.width), Math.round(wr.height)],
      fps: (document.getElementById('fps') || {}).textContent,
      fpOn: window.__fp ? window.__fp.on : null,
      fpPos: window.__fp ? [window.__fp.x, window.__fp.z] : null,
    };
  });
  console.log('UI 状态:', JSON.stringify(info));

  /* 用 CDP 合成触屏拖动摇杆 */
  const cdp = await ctx.newCDPSession(pg);
  const r = info.joyRect;
  const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
  const before = await pg.evaluate(() => [window.__fp.x, window.__fp.z]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  await pg.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 40, y: cy - 40, id: 1 }] });
  await pg.waitForTimeout(1500);
  const during = await pg.evaluate(() => ({ joy: window.MP && window.MP.diorama ? null : null, pos: [window.__fp.x, window.__fp.z], joyState: { dx: 0 } }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pg.waitForTimeout(400);
  const after = await pg.evaluate(() => [window.__fp.x, window.__fp.z]);
  console.log('摇杆拖动:', JSON.stringify({ before, during: during.pos, after }));

  /* 摇杆内部状态 */
  const joyState = await pg.evaluate(() => {
    const m = window.MP && window.MP.diorama ? null : null;
    return { mag: (window.MP && window.MP.joy) ? window.MP.joy() : 'n/a' };
  });
  console.log('joy 调试接口:', JSON.stringify(joyState));
  await pg.screenshot({ path: '/tmp/mob_joy.png' });
  console.log('错误:', errs.length, errs.slice(0, 3));
  await b.close();
})();
