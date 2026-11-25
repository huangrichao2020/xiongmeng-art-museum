/* 直升机模型多角度目视检查（前 3/4 / 右侧 / 后侧，昼夜各一轮） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const HX = 52, HZ = 50.5, YAW = 0.8;
const fx = -Math.sin(YAW), fz = -Math.cos(YAW);       // 机头方向
const rx = Math.cos(YAW), rz = -Math.sin(YAW);       // 机右方向
const at = (f, r, y) => [HX + fx * f + rx * r, y, HZ + fz * f + rz * r];
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  const views = [
    ['front34', at(6.6, 2.4, 2.2)],
    ['right',   at(0, 7.0, 1.9)],
    ['rear34',  at(-5.0, -4.5, 2.4)],
    ['top',     at(1.0, 2.5, 6.5)]
  ];
  for (const hour of ['13', '21']) {
    await pg.evaluate(h => { const el = document.getElementById('hour'); el.value = h; el.dispatchEvent(new Event('input')); }, hour);
    await pg.waitForTimeout(1500);
    for (const [name, p] of views) {
      await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], 52, 1.4, 50.5), p);
      await pg.waitForTimeout(1200);
      await pg.screenshot({ path: `/tmp/hm_${name}_${hour}.png` });
      console.log('shot', name, hour, JSON.stringify(p.map(v => +v.toFixed(1))));
    }
  }
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
