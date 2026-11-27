/* 江南古村 · 最终验收：三个时段 × 桌面/手机，四视角 + 指标
   用法：node probe_jn_final.js [seed] */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const SEED = process.argv[2] || '4099461353';

async function shoot(b, vp, tag, hours) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: vp.width < 500, isMobile: vp.width < 500, deviceScaleFactor: vp.width < 500 ? 2 : 1 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('[c] ' + String(m.text()).slice(0, 160)); });
  await pg.goto(`http://127.0.0.1:8900/?seed=${SEED}`, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.__jnReady === true, null, { timeout: 180000 });
  await pg.waitForTimeout(1200);

  const stats = await pg.evaluate(() => window.__jnStats());
  const fps = await pg.evaluate(() => new Promise(res => {
    let n = 0; const t = performance.now();
    const tick = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(tick); else res(+(n / ((performance.now() - t) / 1000)).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
  console.log(`[${tag}] fps=${fps} 报错=${errs.length} ${JSON.stringify(stats)}`);

  for (const h of hours) {
    await pg.evaluate((hh) => {
      const s = document.getElementById('jnHour');
      s.value = hh; s.dispatchEvent(new Event('input'));
    }, h);
    await pg.waitForTimeout(1500);
    for (const m of ['over', 'close']) {
      await pg.evaluate((mm) => window.__jnMode(mm), m);
      await pg.waitForTimeout(1400);
      const f = `/tmp/jnf_${tag}_h${String(h).replace('.', '')}_${m}.png`;
      await pg.screenshot({ path: f });
    }
  }
  await ctx.close();
  return { fps, errs: errs.length };
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  await shoot(b, { width: 1280, height: 800 }, 'desk', [12, 17.7, 21]);
  await shoot(b, { width: 390, height: 844 }, 'mob', [12, 21]);
  await b.close();
  console.log('截图目录 /tmp/jnf_*.png');
})();
