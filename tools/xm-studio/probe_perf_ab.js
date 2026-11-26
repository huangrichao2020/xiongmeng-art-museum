/* 卡顿 A/B：到底是「点光源数量」贵，还是「draw call 数量」贵？
   ─────────────────────────────────────────────────────────
   在同一个机位上依次关掉不同的开销，逐项看帧率变化：
     A 全部开着
     B 关掉一半点光源
     C 全关点光源（只留环境光）
     D 关掉后期（composer 直出）
     E 只看 draw call 变化

   用法： node probe_perf_ab.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(12000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
  });

  const measure = async (label) => {
    const r = await pg.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 < 2600) requestAnimationFrame(tick);
        else {
          const i = window.XM_TOUR.renderer.info.render;
          res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), calls: i.calls, tris: i.triangles });
        }
      };
      requestAnimationFrame(tick);
    }));
    console.log(`  ${label.padEnd(26)} ${String(r.fps).padStart(5)} fps   draw ${String(r.calls).padStart(5)}   三角面 ${r.tris}`);
    return r;
  };

  const cams = [
    ['正门广场', [0, 2.2, 2, 0, 3.2, 8]],
    ['市集西列', [-30, 2.0, -4, -36, 1.6, -12]],
    ['全景俯视', [0, 150, 70, 0, 0, 0]]
  ];

  for (const [name, cam] of cams) {
    console.log(`\n=== ${name} ===`);
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1500);
    await measure('A 全部开着');
    await pg.evaluate(() => {
      const T = window.XM_TOUR;
      window.__pts = [];
      T.scene.traverse(o => { if (o.isPointLight) window.__pts.push(o); });
      window.__pts.forEach((l, i) => { if (i % 2 === 1) l.visible = false; });
    });
    await pg.waitForTimeout(1800);
    await measure('B 关一半点光源');
    await pg.evaluate(() => { window.__pts.forEach(l => { l.visible = false; }); });
    await pg.waitForTimeout(1800);
    await measure('C 全关点光源');
    await pg.evaluate(() => {
      window.__pts.forEach(l => { l.visible = true; });
      const T = window.XM_TOUR;
      T.scene.traverse(o => { if (o.isLight && !o.isPointLight) o.visible = false; });
    });
    await pg.waitForTimeout(1800);
    await measure('D 只留点光源(关平行光)');
    await pg.evaluate(() => {
      const T = window.XM_TOUR;
      T.scene.traverse(o => { if (o.isLight) o.visible = true; });
    });
    await pg.waitForTimeout(1200);
  }

  await b.close();
})();
