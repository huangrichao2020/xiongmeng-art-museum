/* 露天马戏团验收探针：本地构建产物
   1) 画面与动画是否真的在跑（礼帽/兔子/苹果/钢丝/吊环/彩球位置随时间变）
   2) draw call 增量（隐藏/显示马戏团对比）
   3) 邻居灰阶影响（马戏团开/关时，画面左右两侧非主体区域的平均亮度差）
   4) 多机位截图 + 手机 393x873
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.CIRCUS_URL || 'http://127.0.0.1:8899/?ui';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('desktop ' + String(e).slice(0, 200)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console ' + String(m.text()).slice(0, 200)); });
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 120000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await pg.waitForTimeout(800);

  /* ── 1. 动画确实在动：两次采样对比 ── */
  const s1 = await pg.evaluate(() => window.diorama.circus());
  await pg.waitForTimeout(2600);
  const s2 = await pg.evaluate(() => window.diorama.circus());
  console.log('sample1', JSON.stringify(s1));
  console.log('sample2', JSON.stringify(s2));
  const moved = ['hatY', 'apple0', 'walkerX', 'trapZ', 'ball0', 'sweepY']
    .filter(k => JSON.stringify(s1[k]) !== JSON.stringify(s2[k]));
  console.log('changed fields =', moved.join(',') || '(NONE)');
  console.log('who =', JSON.stringify(s2.who));

  /* ── 2. draw call 增量 ── */
  await pg.evaluate(() => window.MP.freezeCam(22, 18, 30, 50, 3, 30));
  await pg.waitForTimeout(1200);
  const withC = await pg.evaluate(() => window.diorama.perf());
  await pg.evaluate(() => window.diorama.hide('circus'));
  await pg.waitForTimeout(1200);
  const withoutC = await pg.evaluate(() => window.diorama.perf());
  await pg.evaluate(() => window.diorama.show('circus'));
  await pg.waitForTimeout(800);
  console.log('draw calls: with circus =', withC.calls, ' without =', withoutC.calls, ' delta =', withC.calls - withoutC.calls);
  console.log('lights with =', withC.lights, ' tris =', withC.tris);

  /* ── 3. 邻居灰阶影响（左右两侧非主体区域） ── */
  const shotBuf = async () => {
    const buf = await pg.screenshot();
    return 'data:image/png;base64,' + buf.toString('base64');
  };
  const analyzer = await ctx.newPage();
  await analyzer.goto('about:blank');
  /* 全图逐像素对比（排除帐篷所在的屏幕矩形）：
     开/关马戏团两张图，除了帐篷本身，画面其他地方不该有可见变化。 */
  const diffOutside = async (a, b, bbox) => analyzer.evaluate(async ([da, db, bx]) => {
    const load = async (d) => {
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = d; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, img.width, img.height).data;
    };
    const A = await load(da), B = await load(db);
    let sum = 0, n = 0, mx = 0, over3 = 0;
    for (let py = 0; py < 760; py++) for (let px = 0; px < 1100; px++) {
      if (px > bx[0] && px < bx[2] && py > bx[1] && py < bx[3]) continue;
      const i = (py * 1100 + px) * 4;
      const d = Math.abs(.299*A[i] + .587*A[i+1] + .114*A[i+2] - (.299*B[i] + .587*B[i+1] + .114*B[i+2]));
      sum += d; n++; if (d > mx) mx = d; if (d > 3) over3++;
    }
    return { mean: +(sum / n).toFixed(3), max: +mx.toFixed(1), pctOver3: +(over3 / n * 100).toFixed(2), n };
  }, [a, b, bbox]);
  await pg.evaluate(() => { window.diorama.snow(false); window.MP.freezeCam(22, 18, 30, 50, 3, 30); });
  await pg.waitForTimeout(1400);
  await pg.screenshot({ path: '/tmp/gray_on.png' });
  const onData = await shotBuf();
  /* 对照组：什么都不改，隔同样时间再拍一张 —— 差值就是纯动画噪声底噪 */
  await pg.waitForTimeout(900);
  const ctrlData = await shotBuf();
  await pg.evaluate(() => window.diorama.hide('circus'));
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: '/tmp/gray_off.png' });
  const offData = await shotBuf();
  await pg.evaluate(() => window.diorama.show('circus'));
  await pg.waitForTimeout(700);
  console.log('diff outside tent bbox:', JSON.stringify(await diffOutside(onData, offData, [280, 210, 780, 640])));
  console.log('diff NOISE FLOOR     :', JSON.stringify(await diffOutside(onData, ctrlData, [280, 210, 780, 640])));

  /* ── 4. 多机位截图 ── */
  const shots = [
    ['entrance', 36.0, 4.2, 30.0, 50, 3.4, 30],
    ['inside', 44.0, 2.4, 30.0, 50.5, 3.2, 30],
    ['high', 44.0, 22.0, 12.0, 50, 2.0, 30],
    ['side', 50.0, 6.0, 14.0, 50, 4.0, 30],
    ['north', 50.0, 4.0, 46.0, 50, 3.5, 30],
    ['magic', 49.6, 2.0, 29.2, 47.2, 1.5, 32.8],
    ['clown', 50.2, 2.0, 29.0, 52.8, 1.5, 32.8],
    ['trap', 45.0, 3.2, 25.5, 50.0, 2.8, 30.0],
    ['walk', 47.0, 4.4, 25.0, 53.0, 3.4, 27.2],
  ];
  for (const [n, px, py, pz, tx, ty, tz] of shots) {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), [px, py, pz, tx, ty, tz]);
    await pg.waitForTimeout(1300);
    await pg.screenshot({ path: '/tmp/ci_' + n + '.png' });
  }
  await pg.close();

  /* ── 5. 手机 ── */
  const mctx = await b.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mp = await mctx.newPage();
  mp.on('pageerror', e => errs.push('mobile ' + String(e).slice(0, 200)));
  await mp.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await mp.waitForFunction(() => window.MP && window.diorama, null, { timeout: 120000 });
  await mp.waitForTimeout(9000);
  await mp.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });
  await mp.evaluate(() => window.diorama.shot('circus-front'));
  await mp.waitForTimeout(2600);
  await mp.screenshot({ path: '/tmp/ci_mobile.png' });
  console.log('mobile shot', JSON.stringify(await mp.evaluate(() => window.diorama.debug ? window.diorama.debug().dir : null)));
  console.log('mobile perf', JSON.stringify(await mp.evaluate(() => window.diorama.perf())));
  await mp.close();

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
