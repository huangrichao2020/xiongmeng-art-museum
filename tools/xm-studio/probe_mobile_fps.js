/* 手机端真实帧率体检（2026-11-26）
   用户主要用手机浏览器访问 —— 桌面 headless 的数字不代表他的体感。
   用 iPhone 尺寸视口 + ?mobile 开关，量几个玩家常走机位的 fps / draw call。
   用法： node probe_mobile_fps.js
*/
const { chromium, devices } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  const t0 = Date.now();
  await pg.goto('http://127.0.0.1:8899/?ui&mobile', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  console.log('首屏可交互耗时', ((Date.now() - t0) / 1000).toFixed(1), '秒');
  await pg.waitForTimeout(12000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
  });

  const info = await pg.evaluate(() => {
    const T = window.XM_TOUR;
    return {
      dpr: T.renderer.getPixelRatio(),
      size: [T.renderer.domElement.width, T.renderer.domElement.height],
      touch: (('ontouchstart' in window) || navigator.maxTouchPoints > 0)
    };
  });
  console.log('渲染像素比', info.dpr, '画布', info.size.join('×'), '触屏', info.touch);

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
    console.log(name.padEnd(12), String(r.fps).padStart(6), 'fps   draw', String(r.calls).padStart(5), '  三角面', String(r.tris).padStart(9));
  };

  console.log('\n=== 手机视口下各机位 ===');
  await measure('正门广场', [0, 2.2, 2, 0, 3.2, 8]);
  await measure('公交站', [-30, 2.0, 15, -29.5, 2.2, 9.5]);
  await measure('南段马路', [0, 2.2, 12.5, -20, 2.0, 14]);
  await measure('市集西列', [-30, 2.0, -4, -36, 1.6, -12]);
  await measure('喷泉花园', [-16, 2.0, 6, -24.4, 2.0, 0.2]);
  await measure('全景俯视', [0, 150, 70, 0, 0, 0]);

  await b.close();
})();
