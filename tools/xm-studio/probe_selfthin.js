/* 同机位随时间「自己变轻」体检（2026-11-26）
   现象：正门广场同一相机，draw 2460 → 1750、三角面少 32 万，之后不再变。
   这里按秒采样可见 mesh 清单，diff 出到底是哪些物件自己消失了。
   用法： node probe_selfthin.js
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

  const snap = () => pg.evaluate(() => {
    const T = window.XM_TOUR;
    const list = [];
    T.scene.traverse(o => {
      if (!o.isMesh) return;
      let vis = o.visible, q = o.parent;
      while (vis && q) { vis = q.visible; q = q.parent; }
      if (!vis) return;
      const g = o.geometry;
      list.push(o.id + ':' + (g && g.attributes.position ? g.attributes.position.count : 0) + ':' + (Array.isArray(o.material) ? 'multi' : (o.material && o.material.uuid || '')));
    });
    let calls = 0, tris = 0;
    T.scene.traverse(o => { if (o.isMesh && o.visible) calls++; });
    return { list, calls, tris: T.renderer.info.render.triangles };
  });

  const marks = [];
  for (let i = 0; i < 14; i++) {
    const s = await snap();
    marks.push({ t: i * 2, s });
    console.log(String(i * 2 + 's').padStart(4), '可见 mesh', String(s.list.length).padStart(5), ' draw', String(s.calls).padStart(5), ' 三角面', String(s.tris).padStart(9));
    await pg.waitForTimeout(2000);
  }
  // diff：第一帧 vs 最后一帧
  const a = new Set(marks[0].s.list), z = new Set(marks[marks.length - 1].s.list);
  const gone = [...a].filter(x => !z.has(x));
  console.log(`\n=== 前 2 秒有、最后 2 秒没有的 mesh：${gone.length} 个 ===`);
  // 按几何顶点数归类
  const byGeo = new Map();
  gone.forEach(k => { const p = k.split(':')[1]; byGeo.set(p, (byGeo.get(p) || 0) + 1); });
  [...byGeo.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).forEach(([v, n]) => console.log(`  顶点数 ${v} × ${n}`));
  await b.close();
})();
