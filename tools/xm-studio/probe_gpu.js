const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE='https://preview.ai10088.com/alex-garage/';

const CONFIGS = [
  { name:'swiftshader(当前)', args:['--use-gl=angle','--enable-unsafe-swiftshader'] },
  { name:'默认(macOS GPU)', args:['--autoplay-policy=no-user-gesture-required'] },
  { name:'angle-metal', args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'] },
];

(async () => {
  for (const cfg of CONFIGS) {
    let b;
    try {
      b = await chromium.launch({ executablePath: EXE, args: cfg.args });
      const ctx = await b.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
      const p = await ctx.newPage();
      let err='';
      p.on('pageerror', e => err = String(e).slice(0,120));
      await p.goto(SITE, { waitUntil:'load', timeout:90000 });
      await p.waitForFunction(() => window.XM && window.XM.version, { timeout:90000 });
      await p.waitForTimeout(3000);
      const info = await p.evaluate(async () => {
        const c = document.querySelector('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
        const rend = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a';
        // 测 60 帧真实耗时
        const t0 = performance.now();
        let n = 0;
        await new Promise(res => {
          const tick = () => { n++; if (n >= 60) return res(); requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        const dt = performance.now() - t0;
        return { rend, fps: +(60000/dt).toFixed(1), msPerFrame: +(dt/60).toFixed(1) };
      });
      console.log(cfg.name.padEnd(22), JSON.stringify(info), err?('ERR:'+err):'');
      await b.close();
    } catch (e) {
      console.log(cfg.name.padEnd(22), 'FAILED', String(e).slice(0,160));
      try { if (b) await b.close(); } catch (_) {}
    }
  }
})();
