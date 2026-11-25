/* 微缩景观优化验证：夜景 / 白天 对比 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/?ui';

const SHOTS = [
  { id: 'mn-piano',  p: [-42.2, 1.45, -12.8], t: [-44.5, 0.85, -12.2], fov: 52 },
  { id: 'mn-street', p: [-36.0, 2.2, -6.0],   t: [-45.3, 1.2, -12.0],  fov: 55 },
  { id: 'mn-wide',  p: [-42, 22, 0],       t: [-43.5, 0, -12],     fov: 54 },
  { id: 'mn-church',p: [-38, 3.0, -16],     t: [-49, 12, 20],       fov: 58 },
];

(async () => {
  const accs = pickAccounts('mn');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 150000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 150000 });
  await pg.waitForTimeout(3000);
  await pg.evaluate((a) => {
    const A = document.getElementById('mp-acc'), P = document.getElementById('mp-pass');
    if (A && P) { A.value = a; P.value = '123456'; document.getElementById('mp-go').click(); }
  }, accs.a);
  await pg.waitForFunction(() => window.MP && window.MP.connected, null, { timeout: 30000 }).catch(() => { });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => { if (window.diorama) window.diorama.snow(false); });

  const shoot = async (tag) => {
    for (const s of SHOTS) {
      await pg.evaluate((s) => {
        window.diorama.fov(s.fov);
        window.MP.freezeCam(s.p[0], s.p[1], s.p[2], s.t[0], s.t[1], s.t[2]);
      }, s);
      await pg.waitForTimeout(1500);
      await pg.screenshot({ path: `/tmp/${tag}_${s.id}.png` });
    }
  };
  await shoot('night');
  // 切到白天
  await pg.evaluate(() => {
    const h = document.getElementById('hour');
    if (h) { h.value = '13.5'; h.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await pg.waitForTimeout(2500);
  await shoot('day');
  const st = await pg.evaluate(() => ({ perf: window.diorama.perf(), audit: window.diorama.sceneAudit().slice(0, 14) }));
  console.log('perf =', JSON.stringify(st.perf));
  console.log('纯色大面积材质 top =', JSON.stringify(st.audit));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
