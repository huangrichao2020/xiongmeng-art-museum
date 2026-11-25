/* 灯池 A/B：同一机位，点灯池 开 / 关 各拍一张夜景 + 量帧率 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
const CAMS = {
  plaza: [22, 18, 26, 0, 4, -6],
  piano: [-40.4, 4.2, -2.5, -40.4, 1.2, -12],
  west: [-46, 12, 14, -40, 4, -2],
  church: [-30, 14, 48, -49, 8, 30],
  fair: [34, 20, 42, 46, 6, 30],
};
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login');if(e)e.style.display='none';});
  const fps = async () => pg.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(tick);
  }));
  for (const [name, cam] of Object.entries(CAMS)) {
    await pg.evaluate(c => { window.MP.freezeCam(...c); const h = document.getElementById('hour'); h.value = '21.5'; h.dispatchEvent(new Event('input')); }, cam);
    await pg.waitForTimeout(1200);
    await pg.evaluate(() => window.diorama.lp(true));
    await pg.waitForTimeout(1800);
    await pg.screenshot({ path: '/tmp/lp_on_' + name + '.png' });
    const fOn = await fps();
    await pg.evaluate(() => window.diorama.lp(false));
    await pg.waitForTimeout(1800);
    await pg.screenshot({ path: '/tmp/lp_off_' + name + '.png' });
    const fOff = await fps();
    await pg.evaluate(() => window.diorama.lp(true));
    console.log(name.padEnd(8), '池ON', String(fOn).padStart(3), 'fps  |  全量灯', String(fOff).padStart(3), 'fps');
  }
  await b.close();
})();
