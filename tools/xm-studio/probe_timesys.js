/* 加载耗时 + 时间系统体检 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.LOCAL_URL || 'https://preview.ai10088.com/alex-garage/?ui';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 160)); });

  const t0 = Date.now();
  await pg.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  const tLoad = Date.now() - t0;
  const t1 = Date.now();
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  const tReady = Date.now() - t1;
  await pg.waitForTimeout(3000);
  console.log('LOAD ' + tLoad + 'ms | READY(MP.freezeCam) +' + tReady + 'ms');

  const ui = await pg.evaluate(() => {
    const seasons = document.getElementById('seasons');
    const btns = seasons ? Array.from(seasons.querySelectorAll('button')) : [];
    const rail = document.getElementById('rail');
    const hour = document.getElementById('hour');
    const r = rail ? rail.getBoundingClientRect() : null;
    return {
      seasonCount: btns.length,
      seasonLabels: btns.map(b => b.textContent.trim().slice(0, 12)),
      railExists: !!rail,
      railVisible: r ? (r.width > 0 && r.height > 0) : false,
      railRect: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      hourExists: !!hour, hourVal: hour ? hour.value : null,
      hourRange: hour ? [hour.min, hour.max, hour.step] : null,
      build: document.body.innerHTML.match(/__XM_BUILD__|b[0-9a-f]{10}/) ? 'n/a' : 'n/a'
    };
  });
  console.log('UI=' + JSON.stringify(ui));

  // 逐个时段点一遍，看天空/雾/光有没有真的变
  const slots = await pg.evaluate(() => Array.from(document.querySelectorAll('#seasons button')).map(b => b.dataset.k));
  for (const k of slots) {
    await pg.evaluate((k) => {
      const b = Array.from(document.querySelectorAll('#seasons button')).find(x => x.dataset.k === k);
      if (b) b.click();
    }, k);
    await pg.waitForTimeout(1200);
    const st = await pg.evaluate(() => {
      const S = window.diorama ? window.diorama.scene() : null;
      const r = window.__skyProbe;
      return { hour: document.getElementById('hour') ? document.getElementById('hour').value : null,
               weather: document.getElementById('r-weather') ? document.getElementById('r-weather').textContent : null };
    });
    console.log('SLOT ' + k + ' hour=' + st.hour + ' weather=' + st.weather);
    await pg.screenshot({ path: '/tmp/ts_' + k + '.png' });
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 8).join('\n') : 'no page errors');
  await b.close();
})();
