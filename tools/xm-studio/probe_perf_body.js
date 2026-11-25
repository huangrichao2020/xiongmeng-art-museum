/* A/B：躯干标 keep 后 draw call / fps 变化 + 404 资源定位 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const notFound = [];
  pg.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });
  pg.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  console.log('404 资源:', notFound.length ? [...new Set(notFound)].join('\n  ') : '(无)');

  const cams = {
    plaza: [22, 18, 26, 0, 4, -6],
    market: [-30, 10, 6, -22, 3, -12],
    circus: [44, 3.2, 26, 50.5, 3.0, 30.0]
  };
  for (const [n, c] of Object.entries(cams)) {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), c);
    await pg.waitForTimeout(1500);
    const p = await pg.evaluate(() => window.diorama.perf());
    console.log(`${n}: calls=${p.calls} tris=${p.tris} lights=${p.lights}`);
  }

  // fps：广场沙盘跑 4 秒
  await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cams.plaza);
  await pg.waitForTimeout(1200);
  const fps = await pg.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
  console.log('plaza fps =', fps);

  // 人物相关 draw call 占比
  const person = await pg.evaluate(() => {
    let groups = 0, meshes = 0;
    window.diorama.scene().traverse(o => {
      if (o.isGroup && o.userData && o.userData.legL && o.userData.armL) { groups++; meshes += o.children.filter(c => c.isMesh).length; }
    });
    return { groups, meshes };
  });
  console.log('人物组数 =', person.groups, ' 人物直接子 mesh 合计 =', person.meshes);

  await b.close();
})();
