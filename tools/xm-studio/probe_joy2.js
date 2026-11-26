/* 默认出生点方向体检：四个方向上，键盘位移 vs 摇杆位移 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const W = 390, H = 844;
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { const el = document.getElementById('mp-login'); if (el) el.style.display = 'none'; });
  // 页面默认就是沉浸（第一��称），等它自己进
  await pg.waitForTimeout(1500);
  console.log('模式:', JSON.stringify(await pg.evaluate(() => ({ on: diorama.fp.get().on, pos: diorama.fp.get() }))));

  async function kb(key) {
    const a = await pg.evaluate(() => diorama.fp.get());
    await pg.keyboard.down(key); await pg.waitForTimeout(800); await pg.keyboard.up(key);
    await pg.waitForTimeout(150);
    const c = await pg.evaluate(() => diorama.fp.get());
    return { dx: +(c.x - a.x).toFixed(2), dz: +(c.z - a.z).toFixed(2) };
  }
  async function touch(type, x, y) {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
  }
  async function joySlide(sx, sy, dx, dy) {
    await touch('touchStart', sx, sy);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', sx + dx * i / 6, sy + dy * i / 6); await pg.waitForTimeout(16); }
  }

  const jr = await pg.evaluate(() => { const r = document.getElementById('joystick').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  const jcx = jr[0] + jr[2] / 2, jcy = jr[1] + jr[3] / 2;

  const SPOTS = [[0, 10.2, '默认出生点(门前)'], [0, 0, '广场中心'], [-18, 0, '西侧空地'], [0, 20, '南段马路旁']];
  for (const [x, z, name] of SPOTS) {
    await pg.evaluate(([x, z]) => diorama.fp.set(x, 0.26, z, 0), [x, z]);
    await pg.waitForTimeout(600);
    const L = await kb('KeyA'), R = await kb('KeyD'), Wf = await kb('KeyW'), S = await kb('KeyS');
    console.log(`${name}  键盘 左${L.dx} 右${R.dx} 前${Wf.dz} 后${S.dz}`);
    // 摇杆四方向（从盘心滑 45px）
    const dirs = [['左', -45, 0], ['右', 45, 0], ['上', 0, -45], ['下', 0, 45]];
    for (const [n, dx, dy] of dirs) {
      await pg.evaluate(([x, z]) => diorama.fp.set(x, 0.26, z, 0), [x, z]);
      await pg.waitForTimeout(500);
      const a = await pg.evaluate(() => diorama.fp.get());
      await joySlide(jcx, jcy, dx, dy);
      await pg.waitForTimeout(900);
      const c = await pg.evaluate(() => diorama.fp.get());
      const j = await pg.evaluate(() => diorama.joy());
      await touch('touchEnd', 0, 0);
      await pg.waitForTimeout(350);
      console.log(`   摇杆${n} joy(dx=${j.dx},dy=${j.dy},mag=${j.mag}) 位移 dx=${(c.x - a.x).toFixed(2)} dz=${(c.z - a.z).toFixed(2)}`);
    }
  }
  await b.close();
})();
