/* 傍晚「白膜」归因：基线 / 关雾 / 关天际线自发光 / 关蒸汽 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
const CAMS = {
  plaza: [22, 18, 26, 0, 4, -6],
  west: [-46, 12, 14, -40, 4, -2],
  market: [-30, 10, 6, -22, 3, -12],
};
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  const cam = process.env.CAM || 'market';
  const c = CAMS[cam], hour = process.env.HOUR || '17.5', tag = process.env.TAG || 'w2';
  const setup = ({ c, hour }) => {
    window.diorama.setRain(0);
    const el = document.getElementById('hour'); el.value = String(hour); el.dispatchEvent(new Event('input'));
    window.MP.freezeCam(c[0], c[1], c[2], c[3], c[4], c[5]);
  };
  await pg.evaluate(setup, { c, hour });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `/tmp/${tag}_base.png` });

  // 变体：关雾
  await pg.evaluate(() => { window.diorama.scene().userData.baseFogD = 0; });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: `/tmp/${tag}_nofog.png` });
  await pg.evaluate(() => { window.diorama.scene().userData.baseFogD = 0.0082; });

  // 变体：关天际线自发光
  const n1 = await pg.evaluate(() => {
    let n = 0;
    window.diorama.scene().traverse(o => {
      if (o.isMesh && o.material && o.material.emissiveMap && o.material.emissiveIntensity > 0.2 && o.material.emissiveIntensity < 0.6) {
        o.material.emissiveIntensity = 0; n++;
      }
    });
    return n;
  });
  console.log('emissive off meshes:', n1);
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: `/tmp/${tag}_noemis.png` });

  await b.close();
})();
