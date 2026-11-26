/* 卡顿 + 穿模一体排查（2026-11-26）
   一、公交站大树穿模：拍 4 个机位 + 把该区域物件全 dump 出来
   二、卡顿：在几个玩家常走的位置量 FPS + draw call + 三角面数

   用法： node probe_stuck.js [--shots] [--fps]
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const args = process.argv.slice(2);
const DO_SHOTS = args.includes('--shots');
const DO_FPS = args.includes('--fps') || !DO_SHOTS;

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
  });

  if (DO_SHOTS) {
    const shot = async (name, cam) => {
      await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
      await pg.waitForTimeout(1400);
      await pg.screenshot({ path: `/tmp/stuck_${name}.png` });
      console.log('shot', name);
    };
    await shot('bus_front', [-30, 2.0, 16, -29.5, 2.4, 9.5]);   // 从马路这边平视公交站
    await shot('bus_side', [-38, 2.6, 10, -29.5, 2.2, 9.5]);    // 从西侧看
    await shot('bus_top', [-30, 26, 12, -29.5, 0, 9.5]);        // 俯视
    await shot('bus_east', [-22, 2.0, 9, -29.5, 2.2, 9.5]);     // 从东侧看
  }

  /* ── 把公交站区域的物件全列出来，看谁和谁重叠 ── */
  const dump = await pg.evaluate(() => window.diorama.dump(-40, 4, -20, 16));
  console.log('\n=== 公交站区域物件 (-40..-20, 4..16) ===');
  dump.sort((a, b2) => (a.mn[2] - b2.mn[2]) || (a.mn[0] - b2.mn[0]));
  for (const o of dump) {
    console.log(`  ${o.geo.padEnd(14)} ${o.c.padEnd(9)} ${o.chain.padEnd(42)} ` +
      `x[${o.mn[0]},${o.mx[0]}] y[${o.mn[1]},${o.mx[1]}] z[${o.mn[2]},${o.mx[2]}]`);
  }

  if (DO_FPS) {
    const measure = async (name, cam) => {
      await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
      await pg.waitForTimeout(1200);
      const r = await pg.evaluate(() => new Promise(res => {
        let n = 0; const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          else {
            const i = window.XM_TOUR.renderer.info.render;
            res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), calls: i.calls, tris: i.triangles });
          }
        };
        requestAnimationFrame(tick);
      }));
      console.log(name.padEnd(14), String(r.fps).padStart(5), 'fps   draw', String(r.calls).padStart(4), '  三角面', r.tris);
    };
    console.log('\n=== 各机位帧率 ===');
    await measure('正门广场', [0, 2.2, 2, 0, 3.2, 8]);
    await measure('公交站', [-30, 2.0, 15, -29.5, 2.2, 9.5]);
    await measure('南段马路', [0, 2.2, 12.5, -20, 2.0, 14]);
    await measure('市集西列', [-30, 2.0, -4, -36, 1.6, -12]);
    await measure('喷泉花园', [-16, 2.0, 6, -24.4, 2.0, 0.2]);
    await measure('鸟巢外环', [30, 2.2, -38, 30, 3.0, -52]);
    await measure('游乐园', [26, 2.2, 30, 27, 8.0, 36]);
    await measure('教堂红毯', [-49, 2.0, 24, -49, 4.0, 34]);
    await measure('全景俯视', [0, 150, 70, 0, 0, 0]);
  }

  await b.close();
})();
