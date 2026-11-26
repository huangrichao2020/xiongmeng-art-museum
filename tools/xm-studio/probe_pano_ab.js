/* 全景俯视机位瓶颈定位（2026-11-26）
   同一机位下逐项关掉可疑开销，看帧率到底被什么拖住：
     基线 / 关阴影 / 关点光源 / 渲染分辨率减半 / 只留静态（隐藏会动的东西）
   用法： node probe_pano_ab.js
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
    window.MP.freezeCam(0, 150, 70, 0, 0, 0);
  });
  await pg.waitForTimeout(1500);

  const measure = async (label) => {
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
    console.log(label.padEnd(26), String(r.fps).padStart(6), 'fps   draw', String(r.calls).padStart(5), '  三角面', String(r.tris).padStart(9));
    return r;
  };

  console.log('=== 全景俯视机位 (0,150,70) → (0,0,0) ===');
  await measure('基线');

  await pg.evaluate(() => { window.XM_TOUR.renderer.shadowMap.enabled = false; window.XM_TOUR.scene.traverse(o => { if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.needsUpdate = true); else o.material.needsUpdate = true; } }); });
  await pg.waitForTimeout(800);
  await measure('关阴影贴图');
  await pg.evaluate(() => { window.XM_TOUR.renderer.shadowMap.enabled = true; });

  await pg.evaluate(() => { window.__savedLights = []; window.XM_TOUR.scene.traverse(o => { if (o.isPointLight) { window.__savedLights.push([o, o.intensity]); o.intensity = 0; o.visible = false; } }); });
  await pg.waitForTimeout(1200);
  await measure('关全部点光源');
  await pg.evaluate(() => { window.__savedLights.forEach(([o, v]) => { o.intensity = v; o.visible = true; }); });

  await pg.evaluate(() => { const T = window.XM_TOUR; T.renderer.setPixelRatio(0.5); });
  await pg.waitForTimeout(800);
  await measure('渲染分辨率减半');
  await pg.evaluate(() => { const T = window.XM_TOUR; T.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); });

  // 关掉泛光/后期
  const hasPost = await pg.evaluate(() => !!(window.MP && window.MP.post && window.MP.post.toggle));
  console.log('  后期开关接口:', hasPost ? '有' : '无');

  await measure('（恢复后）基线');
  await b.close();
})();
