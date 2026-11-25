/* 验收：① 时间系统入口能不能点到 ② 雨天切过去有没有画面 ③ 加载/帧率有没有变差 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = process.env.LOCAL_URL || 'http://127.0.0.1:8899/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 200)); });
  const t0 = Date.now();
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  const tLoad = Date.now() - t0;
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);

  // ── ① 时间入口 ──
  const ui1 = await pg.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('rail'));
    const cc = document.getElementById('cleanClock');
    const ccs = getComputedStyle(cc);
    return {
      bodyClass: document.body.className,
      railDisplay: cs.display,
      clockDisplay: ccs.display,
      clockText: cc.textContent,
      railRect: document.getElementById('rail').getBoundingClientRect().toJSON(),
    };
  });
  // 点时间牌 → 侧栏应展开
  await pg.evaluate(()=>document.getElementById('cleanClock').click());
  await pg.waitForTimeout(400);
  const ui2 = await pg.evaluate(() => {
    const b = document.getElementById('railBody');
    const r = b.getBoundingClientRect();
    const seasons = [...document.querySelectorAll('#seasons button')].map(x => x.textContent.trim());
    return { bodyClass: document.body.className, railBodyX: Math.round(r.x), opacity: getComputedStyle(b).opacity, seasons };
  });
  // 点「晨」按钮
  await pg.evaluate(()=>document.querySelector('#seasons button[data-k="dawn"]').click());
  await pg.waitForTimeout(600);
  const ui3 = await pg.evaluate(() => ({
    hour: window.diorama && window.diorama.hour ? window.diorama.hour() : null,
    clockText: document.getElementById('cleanClock').textContent,
    weather: document.getElementById('r-weather').textContent,
    bodyClass: document.body.className,
  }));
  await pg.screenshot({ path: '/tmp/rain_dawn.png' });

  // ── ② 切雨天 ──
  await pg.evaluate(() => window.diorama.setRain(1));
  await pg.waitForTimeout(1200);
  const rain1 = await pg.evaluate(() => ({
    weather: window.diorama.weather(),
    rainVisible: !!(window.diorama.scene() && window.diorama.scene().children.find(c => c.material && c.material.uniforms && c.material.uniforms.uSpan)),
    clockText: document.getElementById('cleanClock').textContent,
    btnOn: document.getElementById('t-rain').classList.contains('on'),
    perf: window.diorama.perf(),
  }));
  await pg.screenshot({ path: '/tmp/rain_day.png' });
  await pg.evaluate(() => window.diorama.setRain(0));
  await pg.waitForTimeout(800);
  const snowBack = await pg.evaluate(() => ({ weather: window.diorama.weather(), clock: document.getElementById('cleanClock').textContent }));

  console.log('load=' + tLoad + 'ms');
  console.log('UI1', JSON.stringify(ui1));
  console.log('UI2', JSON.stringify(ui2));
  console.log('UI3', JSON.stringify(ui3));
  console.log('RAIN', JSON.stringify(rain1));
  console.log('SNOWBACK', JSON.stringify(snowBack));
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 6).join('\n') : 'no errors');
  await b.close();
})();
