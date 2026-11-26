/* 阴影 pass 每帧成本体检（2026-11-26）
   renderer.info.render.calls 是整帧所有 pass 的合计（含阴影贴图 pass）。
   这里逐帧采样 calls/triangles，看阴影 pass 是每帧都跑还是每 N 帧跑一次。
   用法： node probe_shadowpass.js
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
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    window.XM_TOUR.stopDirector();
    window.MP.freezeCam(0, 2.2, 2, 0, 3.2, 8);
  });
  await pg.waitForTimeout(8000);

  const r = await pg.evaluate(() => new Promise(res => {
    const T = window.XM_TOUR;
    const rows = [];
    let n = 0;
    const tick = () => {
      const i = T.renderer.info.render;
      rows.push([i.calls, i.triangles, T.renderer.shadowMap.needsUpdate ? 1 : 0]);
      if (++n < 180) requestAnimationFrame(tick);
      else res({
        rows,
        autoUpdate: T.renderer.shadowMap.autoUpdate,
        enabled: T.renderer.shadowMap.enabled,
        type: T.renderer.shadowMap.type,
        mapSize: T.renderer.shadowMap.enabled ? null : null
      });
    };
    requestAnimationFrame(tick);
  }));

  console.log('shadowMap.enabled', r.enabled, ' autoUpdate', r.autoUpdate, ' type', r.type);
  const calls = r.rows.map(x => x[0]);
  const tris = r.rows.map(x => x[1]);
  const hist = new Map();
  calls.forEach(c => { const k = Math.round(c / 100) * 100; hist.set(k, (hist.get(k) || 0) + 1); });
  console.log('\n=== 逐帧 draw call 分布 ===');
  [...hist.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, v]) => console.log(`  ${String(k).padStart(6)} 次  ${'█'.repeat(Math.round(v / 3))} ${v} 帧`));
  console.log('\n前 40 帧 (calls / tris / needsUpdate):');
  r.rows.slice(0, 40).forEach((x, i) => console.log(`  ${String(i).padStart(3)}  ${String(x[0]).padStart(5)}  ${String(x[1]).padStart(9)}  ${x[2]}`));
  await b.close();
})();
