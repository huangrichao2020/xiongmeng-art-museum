/* A/B：关掉一部分点光源后帧率变化 → 判断瓶颈是灯还是 draw call */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
const CAM = [22, 18, 26, 0, 4, -6];
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(7000);   // 等合批完成
  await pg.evaluate(c => window.MP.freezeCam(...c), CAM);
  await pg.waitForTimeout(1500);

  const fps = async () => pg.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(tick);
  }));

  const info = async () => pg.evaluate(() => window.diorama.perf());

  console.log('BASE   ', await fps(), JSON.stringify(await info()));

  for (const n of [0, 4, 8, 12, 16, 23]) {
    const r = await pg.evaluate((n) => {
      const scene = window.diorama.scene();
      const ps = [];
      scene.traverse(o => { if (o.isPointLight) ps.push(o); });
      ps.forEach(l => { l.visible = true; });
      ps.sort((a, b) => a.intensity - b.intensity);
      ps.slice(0, n).forEach(l => { l.visible = false; });
      return { total: ps.length, off: n, left: ps.length - n };
    }, n);
    await pg.waitForTimeout(2600);
    console.log('点光剩', String(r.left).padStart(2), '盏 → fps', await fps(), JSON.stringify(await info()));
  }

  // 只看 CPU 侧：draw call 的开销有多大？把场景里一半的东西 visible=false
  await b.close();
})();
