/* 摇杆方向键体检：真触摸事件 + 键盘基线，逐方向量「摇杆输出」和「人物实际位移」
   用法：node probe_joy.js [mode]   mode = fp | sandbox */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const MODE = process.argv[2] || 'fp';
const W = 390, H = 844;

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const cdp = await ctx.newCDPSession(pg);
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama && window.diorama.fp, null, { timeout: 180000 });
  await pg.waitForTimeout(3000);

  // 登录浮层会盖住整屏（手机上也可能挡住），探针里先藏掉
  const loginWas = await pg.evaluate(() => {
    const el = document.getElementById('mp-login');
    if (!el) return 'none';
    const cs = getComputedStyle(el);
    const was = cs.display !== 'none';
    el.style.display = 'none';
    return was ? 'visible-blocked' : 'hidden';
  });
  console.log('登录浮层:', loginWas);

  const info = await pg.evaluate(() => ({
    touch: document.body.classList.contains('touch'),
    isTouchDev: (typeof IS_TOUCH_DEV !== 'undefined') ? IS_TOUCH_DEV : 'n/a',
    maxTP: navigator.maxTouchPoints,
    joyRect: (() => { const r = document.getElementById('joystick').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    stickRect: (() => { const r = document.getElementById('stick').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    vw: innerWidth, vh: innerHeight
  }));
  console.log('环境:', JSON.stringify(info));

  // 进第一人称 / 或停在沙盘
  await pg.evaluate((mode) => {
    if (mode === 'fp') { diorama.enterWalk(); }
    else { diorama.walk(false); }
  }, MODE);
  await pg.waitForTimeout(1200);

  // 找一块四面都能走的空地：以候选点为圆心，逐方向用键盘试
  const CANDIDATES = [[0, 0, 2], [0, 0, 5], [-18, 0, 2], [0, 0, 20], [-24, 0, 0]];
  async function place(x, z) {
    return await pg.evaluate(([x, z]) => { diorama.fp.set(x, 0.26, z, 0); return diorama.fp.get(); }, [x, z]);
  }
  async function kbDir(key) {
    const a = await pg.evaluate(() => diorama.fp.get());
    await pg.keyboard.down(key);
    await pg.waitForTimeout(700);
    await pg.keyboard.up(key);
    await pg.waitForTimeout(200);
    const b = await pg.evaluate(() => diorama.fp.get());
    return { dx: +(b.x - a.x).toFixed(2), dz: +(b.z - a.z).toFixed(2) };
  }
  let spot = null;
  for (const [x, z] of CANDIDATES) {
    await place(x, z);
    await pg.waitForTimeout(400);
    const L = await kbDir('KeyA'), R = await kbDir('KeyD'), U = await kbDir('KeyW'), D = await kbDir('KeyS');
    console.log(`候选点 (${x},${z}) 键盘基线 左:${L.dx} 右:${R.dx} 上:${D.dz} 下:${U.dz}`);
    const free = Math.abs(L.dx) > 0.4 && Math.abs(R.dx) > 0.4 && Math.abs(U.dz) > 0.4 && Math.abs(D.dz) > 0.4;
    if (free) { spot = [x, z]; break; }
  }
  if (!spot) { console.log('!! 没找到四面畅通的空地'); }
  else console.log('选用空地:', spot.join(','));

  // ── 触摸事件原语 ──
  async function touch(type, x, y) {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }]
    });
  }
  async function slide(sx, sy, dx, dy, steps = 6) {
    await touch('touchStart', sx, sy);
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', sx + dx * i / steps, sy + dy * i / steps);
      await pg.waitForTimeout(16);
    }
  }
  async function joyState() {
    return await pg.evaluate(() => ({ joy: diorama.joy(), fp: diorama.fp.get() }));
  }

  const jr = info.joyRect;
  const jcx = jr[0] + jr[2] / 2, jcy = jr[1] + jr[3] / 2;
  console.log('摇杆中心:', jcx.toFixed(0), jcy.toFixed(0));

  const CASES = [
    { n: '在摇杆上滑左', sx: jcx, sy: jcy, dx: -45, dy: 0 },
    { n: '在摇杆上滑右', sx: jcx, sy: jcy, dx: 45, dy: 0 },
    { n: '在摇杆上滑上', sx: jcx, sy: jcy, dx: 0, dy: -45 },
    { n: '在摇杆上滑下', sx: jcx, sy: jcy, dx: 0, dy: 45 },
    { n: '摇杆左半按下滑左', sx: jcx - 30, sy: jcy, dx: -45, dy: 0 },
    { n: '摇杆左半按住不动', sx: jcx - 30, sy: jcy, dx: 0, dy: 0 },
    { n: '摇杆右半滑右', sx: jcx + 30, sy: jcy, dx: 45, dy: 0 },
    { n: '摇杆右侧空白滑右', sx: jcx + 120, sy: jcy, dx: 45, dy: 0 },
    { n: '摇杆左侧空白滑左', sx: jcx - 60, sy: jcy, dx: -45, dy: 0 },
    { n: '摇杆上方空白滑左', sx: jcx, sy: jcy - 120, dx: -45, dy: 0 }
  ];

  for (const c of CASES) {
    if (!spot) break;
    await place(spot[0], spot[1]);
    await pg.waitForTimeout(500);
    const a = await pg.evaluate(() => diorama.fp.get());
    await slide(c.sx, c.sy, c.dx, c.dy);
    await pg.waitForTimeout(120);
    const mid = await joyState();
    await pg.waitForTimeout(900);
    const b = await pg.evaluate(() => diorama.fp.get());
    await touch('touchEnd', 0, 0);
    await pg.waitForTimeout(400);
    const after = await joyState();
    console.log(
      `${c.n.padEnd(18)} joy(dx=${mid.joy.dx},dy=${mid.joy.dy},mag=${mid.joy.mag},act=${mid.joy.active})` +
      ` 位移 dx=${(b.x - a.x).toFixed(2)} dz=${(b.z - a.z).toFixed(2)}` +
      ` 松手后 act=${after.joy.active}`
    );
  }
  console.log('报错:', errs.length, errs.slice(0, 4));
  await b.close();
})();
