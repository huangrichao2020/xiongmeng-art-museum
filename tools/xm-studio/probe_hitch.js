/* 卡帧（hitch）体检（2026-11-26）
   场景每 36 帧整场重渲一次阴影贴图 —— 怀疑这就是"不够丝滑"的周期性顿挫。
   这里统计逐帧耗时分布，并做「关掉阴影重绘」的 A/B。
   用法： node probe_hitch.js
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
  await pg.waitForTimeout(7000);

  const collect = async (label) => {
    const r = await pg.evaluate(() => new Promise(res => {
      const times = [];
      let last = performance.now();
      const N = 200;
      const tick = () => {
        const now = performance.now();
        times.push(now - last); last = now;
        if (times.length < N) requestAnimationFrame(tick);
        else {
          const s = times.slice(5).sort((a, b) => a - b);
          const q = p => s[Math.min(s.length - 1, Math.floor(s.length * p))];
          res({
            avg: +(s.reduce((a, c) => a + c, 0) / s.length).toFixed(2),
            p50: +q(.5).toFixed(2), p95: +q(.95).toFixed(2), max: +s[s.length - 1].toFixed(2),
            over25: s.filter(x => x > 25).length, over33: s.filter(x => x > 33).length, n: s.length
          });
        }
      };
      requestAnimationFrame(tick);
    }));
    console.log(label.padEnd(22), '平均', String(r.avg).padStart(6) + 'ms', ' p50', String(r.p50).padStart(5),
      ' p95', String(r.p95).padStart(6), ' 最长', String(r.max).padStart(7),
      ' >25ms', String(r.over25).padStart(3) + '帧', ' >33ms', String(r.over33).padStart(3) + '帧');
    return r;
  };

  console.log('=== 正门广场 逐帧耗时 ===');
  await collect('基线（每36帧重渲阴影）');

  await pg.evaluate(() => {
    const sm = window.XM_TOUR.renderer.shadowMap;
    window.__smDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sm), 'needsUpdate');
    Object.defineProperty(sm, 'needsUpdate', { set() { }, get() { return false; }, configurable: true });
  });
  await pg.waitForTimeout(1000);
  await collect('关掉阴影重绘');
  await pg.evaluate(() => {
    const sm = window.XM_TOUR.renderer.shadowMap;
    delete sm.needsUpdate;
  });
  await pg.waitForTimeout(1000);
  await collect('恢复阴影重绘');

  await b.close();
})();
