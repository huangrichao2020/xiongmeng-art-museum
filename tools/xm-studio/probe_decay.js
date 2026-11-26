/* 帧率随时间衰减体检（2026-11-26）
   起因：probe_pano_ab 里同一机位先量 29.4fps，折腾几轮之后再量只剩 14.6fps。
   怀疑场景里有「每帧越积越多」的东西（材质/几何体/灯光/贴图）。
   用法： node probe_decay.js [秒数]
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const secs = +(process.argv[2] || 60);
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    window.MP.freezeCam(0, 150, 70, 0, 0, 0);
  });
  await pg.waitForTimeout(6000);

  console.log('秒数   fps   draw   三角面    几何体  贴图  着色器  材质  纹理  场景节点  可见mesh');
  let t = 0;
  while (t <= secs) {
    const r = await pg.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
        else {
          const T = window.XM_TOUR, i = T.renderer.info;
          let meshes = 0, nodes = 0;
          T.scene.traverse(o => { nodes++; if (o.isMesh && o.visible) meshes++; });
          res({
            fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1),
            calls: i.render.calls, tris: i.render.triangles,
            geo: i.memory.geometries, tex: i.memory.textures,
            prog: i.programs ? i.programs.length : -1,
            mats: i.memory.textures, nodes, meshes
          });
        }
      };
      requestAnimationFrame(tick);
    }));
    console.log(String(t).padStart(4), String(r.fps).padStart(6), String(r.calls).padStart(6), String(r.tris).padStart(9),
      String(r.geo).padStart(8), String(r.tex).padStart(6), String(r.prog).padStart(6), String(r.nodes).padStart(7), String(r.meshes).padStart(8));
    t += 10;
  }
  await b.close();
})();
