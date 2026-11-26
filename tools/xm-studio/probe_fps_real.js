/* 真实机位帧率体检（2026-11-26 修正版）
   之前的探针忘了先停掉「开场运镜 + 导演机位」，相机每帧被拉回 intro 位置，
   量到的 fps/draw 其实是同一个画面（标签却是错的机位）。
   正解：先 MP.stopDirector()（同时关 intro 与 director），再 freezeCam。

   用法： node probe_fps_real.js [desktop|mobile]
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

const VIEWS = [
  ['正门广场', [0, 2.2, 2, 0, 3.2, 8]],
  ['公交站', [-30, 2.0, 15, -29.5, 2.2, 9.5]],
  ['南段马路', [0, 2.2, 12.5, -20, 2.0, 14]],
  ['市集西列', [-30, 2.0, -4, -36, 1.6, -12]],
  ['喷泉花园', [-16, 2.0, 6, -24.4, 2.0, 0.2]],
  ['鸟巢外环', [30, 2.2, -38, 30, 3.0, -52]],
  ['游乐园', [26, 2.2, 30, 27, 8.0, 36]],
  ['教堂红毯', [-49, 2.0, 24, -49, 4.0, 34]],
  ['全景俯视', [0, 150, 70, 0, 0, 0]]
];

(async () => {
  const mode = process.argv[2] || 'desktop';
  const mobile = mode === 'mobile';
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 760 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  const t0 = Date.now();
  await pg.goto('http://127.0.0.1:8899/?ui' + (mobile ? '&mobile' : '') + (process.env.CELL ? '&cell=' + process.env.CELL : '') + (process.env.EXTRA ? '&' + process.env.EXTRA : ''), { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  console.log('首屏可交互', ((Date.now() - t0) / 1000).toFixed(1), '秒');
  await pg.waitForTimeout(10000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    window.XM_TOUR.stopDirector();
  });
  await pg.waitForTimeout(1000);

  const measure = async (name, cam) => {
    await pg.evaluate(() => { const T = window.XM_TOUR; T.controls.enabled = false; T.controls.autoRotate = false; });
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1400);
    // 有些端上还有自动运镜会抢相机：量帧率前再钉一次
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(300);
    const r = await pg.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const C = [], T = [];
      const tick = () => {
        n++;
        const i = window.XM_TOUR.renderer.info.render;
        C.push(i.calls); T.push(i.triangles);
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
        else {
          const T2 = window.XM_TOUR;
          const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
          const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
          res({
            fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1),
            calls: med(C), callsAvg: avg(C), tris: med(T), trisAvg: avg(T),
            frames: C.length,
            cam: [T2.camera.position.x, T2.camera.position.y, T2.camera.position.z].map(v => +v.toFixed(1))
          });
        }
      };
      requestAnimationFrame(tick);
    }));
    console.log(name.padEnd(10), String(r.fps).padStart(6), 'fps   draw中位', String(r.calls).padStart(5),
      ' 均', String(r.callsAvg).padStart(5), '  面中位', String(r.tris).padStart(9), ' 均', String(r.trisAvg).padStart(9), '  相机', r.cam.join(','));
    return r;
  };

  console.log(`\n=== ${mode} 真实机位 ===`);
  const res = [];
  for (const [n, c] of VIEWS) res.push([n, await measure(n, c)]);
  const bad = res.filter(x => x[1].fps < 45);
  console.log('\n低于 45fps 的机位：', bad.length ? bad.map(x => `${x[0]} ${x[1].fps}fps/${x[1].calls}draw`).join('，') : '无');
  await b.close();
})();
