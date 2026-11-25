/* 线上终验：时间系统入口 → 切时段 → 切雨天 全链路 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = process.env.LOCAL_URL || 'https://preview.ai10088.com/alex-garage/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const t0 = Date.now();
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  const tLoad = Date.now() - t0;
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(6000);

  const step = async (label, fn) => { const r = await pg.evaluate(fn); console.log(label.padEnd(14), JSON.stringify(r)); return r; };

  await step('初始', () => ({
    clock: document.getElementById('cleanClock').textContent,
    clockVisible: getComputedStyle(document.getElementById('cleanClock')).display,
    railOpen: !document.body.classList.contains('rail-min'),
  }));
  await step('点时间牌', () => { document.getElementById('cleanClock').click(); return { railOpen: !document.body.classList.contains('rail-min') }; });
  await step('时段按钮', () => [...document.querySelectorAll('#seasons button')].map(b => b.textContent.trim()).join('/'));
  await step('切黄昏', () => {
    document.querySelector('#seasons button[data-k="dusk"]').click();
    return { clock: document.getElementById('cleanClock').textContent, weather: document.getElementById('r-weather').textContent };
  });
  await step('切雨天', () => {
    document.getElementById('t-rain').click();
    return { w: window.diorama.weather(), clock: document.getElementById('cleanClock').textContent, on: document.getElementById('t-rain').classList.contains('on') };
  });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: '/tmp/final_dusk_rain.png' });
  await step('切回雪', () => { document.getElementById('t-rain').click(); return { w: window.diorama.weather(), clock: document.getElementById('cleanClock').textContent }; });
  const fps = await pg.evaluate(() => new Promise(res => {
    let n = 0; const s = performance.now();
    const tick = () => { n++; if (performance.now() - s < 2000) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - s) / 1000))); };
    requestAnimationFrame(tick);
  }));
  console.log('load=' + tLoad + 'ms fps=' + fps + ' perf=' + JSON.stringify(await pg.evaluate(() => window.diorama.perf())));
  console.log(errs.length ? 'ERR ' + errs.slice(0, 3).join(' | ') : 'no page errors');
  await b.close();
})();
