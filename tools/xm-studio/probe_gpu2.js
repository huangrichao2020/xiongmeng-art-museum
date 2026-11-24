/* 性能归因：GPU 厂商 + 逐项开关测帧率（渲染负载 vs 后期 vs 阴影 vs draw call） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const HEADLESS = process.argv[3] !== 'headful';

(async () => {
  const b = await chromium.launch({
    executablePath: EXE,
    headless: HEADLESS,
    args: ['--use-gl=angle','--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']
  });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.XM.shot('balloon-above'));
  await p.waitForTimeout(3000);

  const gpu = await p.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  console.log('GPU:', gpu, ' headless=' + HEADLESS);

  const measure = async (label, setup) => {
    await p.evaluate(setup);
    await p.waitForTimeout(1500);
    const r = await p.evaluate(async () => {
      const R = window.__PROBE.renderer;
      const t = [];
      let last = performance.now();
      for (let i = 0; i < 70; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const now = performance.now();
        t.push(now - last); last = now;
      }
      const s = t.slice(10).sort((a, b) => a - b);
      const med = s[Math.floor(s.length / 2)];
      return { fps: +(1000 / med).toFixed(1), calls: R.info.render.calls, tris: R.info.render.triangles };
    });
    console.log(label.padEnd(30), String(r.fps).padStart(6) + 'fps', String(r.calls).padStart(6) + 'calls', String(r.tris).padStart(9) + 'tris');
    return r;
  };

  await measure('baseline', () => {});
  await measure('关 bloom', () => { window.__PROBE.bloomOff = true; });
  await measure('关阴影', () => { window.__PROBE.renderer.shadowMap.enabled = false; window.__PROBE.scene.traverse(o=>{if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);}}); });
  await measure('关阴影+半分辨率', () => { window.__PROBE.renderer.setPixelRatio(0.5); });
  await measure('恢复DPR', () => { window.__PROBE.renderer.setPixelRatio(1); });
  await b.close();
})();
