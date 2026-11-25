/* 决定性验证：只关掉「屋顶蒸汽 sprite」（颜色 f4f8ff）后同机位复拍，看白斑是否消失 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
const CAMS = { plaza: [22, 18, 26, 0, 4, -6], market: [-30, 10, 6, -22, 3, -12] };
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  const cam = process.env.CAM || 'plaza';
  const c = CAMS[cam], hour = process.env.HOUR || '17.5', tag = process.env.TAG || 's';
  const setup = ({ c, hour }) => {
    window.diorama.setRain(0);
    const el = document.getElementById('hour'); el.value = String(hour); el.dispatchEvent(new Event('input'));
    window.MP.freezeCam(c[0], c[1], c[2], c[3], c[4], c[5]);
  };
  await pg.evaluate(setup, { c, hour });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `/tmp/${tag}_a_base.png` });
  const n = await pg.evaluate(() => {
    let k = 0;
    window.diorama.scene().traverse(o => {
      if (o.isSprite && o.material && o.material.color && o.material.color.getHexString() === 'f4f8ff') {
        o.visible = false; k++;
      }
    });
    return k;
  });
  console.log('steam sprites hidden:', n);
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: `/tmp/${tag}_b_nosteam.png` });
  await b.close();
})();
