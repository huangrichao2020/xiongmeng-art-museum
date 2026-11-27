/* 江南古村 · 页面体检：加载 / 报错 / 四个视角截图 / 帧率
   用法：node probe_jn.js [seed] [mobile|desktop] */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SEED = process.argv[2] || '4099461353';
const MODE = process.argv[3] || 'desktop';
const URL = `http://127.0.0.1:8900/?seed=${SEED}`;

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const vp = MODE === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const ctx = await b.newContext({ viewport: vp, hasTouch: MODE === 'mobile', isMobile: MODE === 'mobile', deviceScaleFactor: MODE === 'mobile' ? 2 : 1 });
  const pg = await ctx.newPage();
  const errs = [], warns = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  pg.on('console', m => {
    if (m.type() === 'error') errs.push('[console] ' + String(m.text()).slice(0, 200));
    if (m.type() === 'warning' || m.text().includes('模型模块')) warns.push(String(m.text()).slice(0, 160));
  });
  pg.on('response', r => { if (r.status() >= 400) errs.push('[' + r.status() + '] ' + r.url().slice(-60)); });
  const t0 = Date.now();
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.__jnReady === true, null, { timeout: 180000 });
  console.log('可交互', ((Date.now() - t0) / 1000).toFixed(1), '秒');

  const stats = await pg.evaluate(() => window.__jnStats());
  console.log('统计:', JSON.stringify(stats));

  for (const m of ['over', 'close', 'orbit', 'walk']) {
    await pg.evaluate((mm) => window.__jnMode(mm), m);
    await pg.waitForTimeout(m === 'walk' ? 1200 : 1600);
    await pg.screenshot({ path: `/tmp/jn_${m}_${MODE}.png` });
    console.log('  截图', m, '→', `/tmp/jn_${m}_${MODE}.png`);
  }
  /* 帧率 */
  const fps = await pg.evaluate(() => new Promise(res => {
    let n = 0; const t = performance.now();
    const tick = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(tick); else res(+(n / ((performance.now() - t) / 1000)).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
  console.log('帧率:', fps, 'fps');
  console.log('缺失模块警告:', warns.length ? warns.slice(0, 4) : '无');
  console.log('报错:', errs.length);
  errs.slice(0, 8).forEach(e => console.log('  ', e));
  await b.close();
})();
