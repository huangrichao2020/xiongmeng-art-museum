/* 第一人称走路抖动量化：按住 W 走 2 秒，统计相机 y 的抖动幅度 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama && window.diorama.cam, null, { timeout: 180000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  // 进入第一人称并站到室外雪地
  await pg.evaluate(() => { window.diorama.fp.set(-10.5, 1.7, 12, 3.14, 0); });
  await pg.waitForTimeout(800);
  // 先站着不动 1.5 秒（基线：地面起伏本身的量）
  const still = await pg.evaluate(() => new Promise(resolve => {
    const ys = []; const t0 = performance.now();
    const tick = () => { ys.push(window.diorama.cam().y);
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
      else { const mean = ys.reduce((a,b)=>a+b,0)/ys.length;
        const sd = Math.sqrt(ys.reduce((a,b)=>a+(b-mean)*(b-mean),0)/ys.length);
        let mj=0; for(let i=1;i<ys.length;i++) mj=Math.max(mj,Math.abs(ys[i]-ys[i-1]));
        resolve({n:ys.length, sd_mm:+(sd*1000).toFixed(2), maxJump_mm:+(mj*1000).toFixed(2)}); } };
    requestAnimationFrame(tick);
  }));
  console.log('STILL', JSON.stringify(still));
  // 按住 W 走
  await pg.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  });
  await pg.waitForTimeout(700);
  const res = await pg.evaluate(() => new Promise(resolve => {
    const ys = [], xs = [];
    const t0 = performance.now();
    const tick = () => {
      const c = window.diorama.cam();
      ys.push(c.y); xs.push(c.x);
      if (performance.now() - t0 < 2200) requestAnimationFrame(tick);
      else {
        const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
        const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) * (b - mean), 0) / ys.length);
        let maxJump = 0;
        for (let i = 1; i < ys.length; i++) maxJump = Math.max(maxJump, Math.abs(ys[i] - ys[i - 1]));
        const moved = Math.abs(xs[xs.length - 1] - xs[0]);
        resolve({ frames: ys.length, yMean: +mean.toFixed(4), yStdDev_mm: +(sd * 1000).toFixed(2), maxFrameJump_mm: +(maxJump * 1000).toFixed(2), movedX: +moved.toFixed(2) });
      }
    };
    requestAnimationFrame(tick);
  }));
  await pg.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
  });
  console.log('WALK', JSON.stringify(res));
  await b.close();
})();
