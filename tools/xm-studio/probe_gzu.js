/* 本地预览探针：贵州大学花溪校区 + 雪人减半 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.LOCAL_URL || 'http://127.0.0.1:8899/index.html?ui';

const SHOTS = [
  { id: 'gzu-north',  p: [4, 14, -34],  t: [0, 16, -72],  fov: 62 },
  { id: 'gzu-far',    p: [6, 30, -30],  t: [0, 12, -74],  fov: 58 },
  { id: 'gzu-plaza',  p: [9, 6.2, 20],  t: [-2, 12, -62], fov: 60 },
  { id: 'gzu-lib',    p: [0, 5, -46],   t: [0, 14, -72],  fov: 56 },
  { id: 'gzu-gate',   p: [0, 2.2, -44], t: [0, 7, -54],   fov: 60 },
  { id: 'gzu-lake',   p: [-30, 3, -60], t: [-47, 1, -76], fov: 60 },
  { id: 'gzu-side',   p: [-64, 14, -48],t: [0, 10, -76],  fov: 60 },
  { id: 'gzu-northc', p: [-20, 26, -60], t: [10, 2, -110], fov: 62 },
  { id: 'gzu-sport',  p: [-56, 12, -84], t: [-56, 1, -107],fov: 58 },
  { id: 'gzu-dorm',   p: [8, 10, -86],   t: [40, 8, -108],  fov: 60 },
  { id: 'gzu-eye',   p: [24, 1.7, 2],    t: [0, 16, -66],  fov: 62 },
  { id: 'gzu-eye2',  p: [-26, 1.7, -7],  t: [2, 14, -64],  fov: 62 },
  { id: 'gzu-snow',  p: [6, 3.2, 12],    t: [-30, 1.2, -6], fov: 60 },
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 120000 });
  await pg.waitForTimeout(4000);
  await pg.evaluate(() => {
    const l = document.getElementById('mp-login'); if (l) l.style.display = 'none';
    if (window.diorama) window.diorama.snow(false);
  });

  const shoot = async (tag) => {
    for (const s of SHOTS) {
      await pg.evaluate((s) => {
        window.diorama.fov(s.fov);
        window.MP.freezeCam(s.p[0], s.p[1], s.p[2], s.t[0], s.t[1], s.t[2]);
      }, s);
      await pg.waitForTimeout(1400);
      await pg.screenshot({ path: '/tmp/' + tag + '_' + s.id + '.png' });
    }
  };
  await shoot('night');
  await pg.evaluate(() => {
    const h = document.getElementById('hour');
    if (h) { h.value = '13.5'; h.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await pg.waitForTimeout(3000);
  await shoot('day');
  const perf = await pg.evaluate(() => window.diorama.perf());
  console.log('PERF=' + JSON.stringify(perf));
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 12).join('\n') : 'no page errors');
  await b.close();
})();
