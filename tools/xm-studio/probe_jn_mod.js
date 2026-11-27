/* 逐个模型模块 import + build 计时：定位是哪个模块卡住/报错 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SEED = process.argv[2] || '4099461353';
const MODS = ['terrain', 'water', 'roads', 'farmland', 'houses', 'trees', 'pagoda', 'paifang', 'props', 'portal'];

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[PAGEERROR]', String(e).slice(0, 400)));
  pg.on('console', m => { if (m.type() === 'error') console.log('[console.err]', String(m.text()).slice(0, 300)); });
  await pg.goto(`http://127.0.0.1:8900/?seed=${SEED}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  /* 等 core 就绪 */
  await pg.waitForFunction(() => !!window.__jnLayout, null, { timeout: 30000 }).catch(() => console.log('__jnLayout 没暴露'));

  for (const m of MODS) {
    const r = await pg.evaluate(async (name) => {
      const t0 = performance.now();
      try {
        const mod = await import(`/src/models/${name}.js`);
        const t1 = performance.now();
        const g = mod.build(window.__jnLayout);
        const t2 = performance.now();
        let meshes = 0, tris = 0;
        g && g.traverse(o => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
        return { ok: true, imp: +(t1 - t0).toFixed(0), build: +(t2 - t1).toFixed(0), meshes, tris: Math.round(tris) };
      } catch (e) {
        return { ok: false, err: String(e && e.message || e).slice(0, 200), imp: +(performance.now() - t0).toFixed(0) };
      }
    }, m);
    console.log(m.padEnd(9), JSON.stringify(r));
  }
  await b.close();
})();
