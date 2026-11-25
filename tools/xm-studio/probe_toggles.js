/* 雪雨双开关 + 左上角撞车 复验 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 250)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  // 1) 撞车复验
  await pg.evaluate(() => {
    const p = document.getElementById('mp-panel');
    if (p) { p.style.display = ''; p.classList.remove('open'); }
    document.body.classList.add('clean');
  });
  await pg.waitForTimeout(600);
  const rects = await pg.evaluate(() => {
    const g = id => { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const tg = g('railToggle'), cc = g('cleanClock'), mb = g('mp-me-btn');
    return { railToggle: tg, cleanClock: cc, mpMe: mb, railVsMe: hit(tg, mb), clockVsMe: hit(cc, mb) };
  });
  console.log('OVERLAP', JSON.stringify(rects));

  // 2) 雪雨开关复验
  const st = async () => pg.evaluate(() => ({
    weather: window.diorama.weather(),
    rain: window.diorama.rain(),
    snowBtn: (document.getElementById('t-snow') || {}).classList.contains('on'),
    rainBtn: (document.getElementById('t-rain') || {}).classList.contains('on'),
    rail: (document.getElementById('r-weather') || {}).textContent
  }));
  console.log('init   ', JSON.stringify(await st()));
  // canvas 覆盖整个视口，playwright 的像素点击会被 canvas 拦下 —— 直接触发 onclick
  const tap = async id => { await pg.evaluate(i => document.getElementById(i).click(), id); await pg.waitForTimeout(500); };
  await tap('t-rain'); console.log('click雨', JSON.stringify(await st()));
  await tap('t-snow'); console.log('click雪', JSON.stringify(await st()));
  await tap('t-snow'); console.log('再点雪', JSON.stringify(await st()));
  await tap('t-rain'); console.log('再点雨', JSON.stringify(await st()));
  await tap('t-rain'); console.log('再点雨2', JSON.stringify(await st()));
  await tap('t-snow'); console.log('再点雪2', JSON.stringify(await st()));
  await pg.screenshot({ path: '/tmp/toggles.png', clip: { x: 0, y: 0, width: 300, height: 330 } });
  await b.close();
})();
