/* 摇杆新语义验收：方向键按住即走 + 手指不落在盘上也响应 + 登录遮罩不挡触摸 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const W = 390, H = 844;
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const cdp = await ctx.newCDPSession(pg);
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);
  // 注意：这次故意不隐藏登录浮层 —— 要验证它不再挡触摸
  const loginVis = await pg.evaluate(() => {
    const el = document.getElementById('mp-login');
    return el ? getComputedStyle(el).display + '/' + getComputedStyle(el).pointerEvents : 'none';
  });
  console.log('登录浮层 display/pointer-events =', loginVis);
  await pg.waitForTimeout(1200);
  console.log('模式:', JSON.stringify(await pg.evaluate(() => diorama.fp.get())));

  const jr = await pg.evaluate(() => { const r = document.getElementById('joystick').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  const jcx = jr[0] + jr[2] / 2, jcy = jr[1] + jr[3] / 2;
  console.log('摇杆中心:', jcx.toFixed(0), jcy.toFixed(0));

  async function touch(type, x, y) {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
  }
  async function reset() { await pg.evaluate(() => diorama.fp.set(0, 0.26, 0, 0)); await pg.waitForTimeout(500); }

  // 按住不动：按下 → 等 1.2s → 读摇杆输出与位移 → 松手
  async function hold(name, sx, sy) {
    await reset();
    const a = await pg.evaluate(() => diorama.fp.get());
    await touch('touchStart', sx, sy);
    await pg.waitForTimeout(1200);
    const j = await pg.evaluate(() => diorama.joy());
    const c = await pg.evaluate(() => diorama.fp.get());
    await touch('touchEnd', 0, 0);
    await pg.waitForTimeout(400);
    const j2 = await pg.evaluate(() => diorama.joy());
    const home = await pg.evaluate(() => { const r = document.getElementById('joystick').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; });
    console.log(`${name.padEnd(22)} joy(dx=${j.dx},dy=${j.dy},mag=${j.mag},mode=${j.mode},act=${j.active}) 位移 dx=${(c.x - a.x).toFixed(2)} dz=${(c.z - a.z).toFixed(2)} 松手后act=${j2.active} 盘位=${home}`);
  }
  // 滑动：按下 → 移动 → 读 → 松手
  async function slide(name, sx, sy, dx, dy) {
    await reset();
    const a = await pg.evaluate(() => diorama.fp.get());
    await touch('touchStart', sx, sy);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', sx + dx * i / 6, sy + dy * i / 6); await pg.waitForTimeout(16); }
    await pg.waitForTimeout(1100);
    const j = await pg.evaluate(() => diorama.joy());
    const c = await pg.evaluate(() => diorama.fp.get());
    await touch('touchEnd', 0, 0);
    await pg.waitForTimeout(400);
    console.log(`${name.padEnd(22)} joy(dx=${j.dx},dy=${j.dy},mag=${j.mag},mode=${j.mode}) 位移 dx=${(c.x - a.x).toFixed(2)} dz=${(c.z - a.z).toFixed(2)}`);
  }

  console.log('\n── 按住不动（方向键语义）');
  await hold('按在盘左侧', jcx - 32, jcy);
  await hold('按在盘右侧', jcx + 32, jcy);
  await hold('按在盘上侧', jcx, jcy - 32);
  await hold('按在盘下侧', jcx, jcy + 32);
  await hold('按在盘正中心', jcx, jcy);

  console.log('\n── 手指不落在盘上');
  await slide('盘左侧空白滑左', jcx - 90, jcy, -40, 0);
  await slide('盘上方空白滑上', jcx, jcy - 110, 0, -40);
  await hold('盘上方空白按住', jcx, jcy - 110);

  console.log('\n── 盘上滑动（仍跟手）');
  await slide('盘上向左滑', jcx, jcy, -40, 0);
  await slide('盘上向右滑', jcx, jcy, 40, 0);

  console.log('\n报错:', errs.length, errs.slice(0, 4));
  await b.close();
})();
