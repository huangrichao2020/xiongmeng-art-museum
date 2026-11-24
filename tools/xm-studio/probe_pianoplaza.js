/* 钢琴广场现状定点拍照（视觉评估用） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PZ_URL || 'https://preview.ai10088.com/alex-garage/?ui';

const SHOTS = [
  { id: 'pz-top',    p: [-42, 22, 0],      t: [-43.5, 0, -12],      fov: 54 },
  { id: 'pz-approach', p: [-40.0, 1.65, -13.0], t: [-45.2, 1.05, -11.5], fov: 50 },
  { id: 'pz-kb',     p: [-42.2, 1.45, -12.8], t: [-44.5, 0.85, -12.2], fov: 52 },
  { id: 'pz-low',    p: [-48.6, 1.15, -12.8], t: [-45.2, 0.90, -11.5], fov: 58 },
  { id: 'pz-back',   p: [-50.5, 2.40, -8.5],  t: [-45.2, 1.30, -11.2], fov: 50 },
  { id: 'pz-ground', p: [-49.8, 0.75, -16.6], t: [-45.3, 0.90, -11.4], fov: 58 },
];

(async () => {
  const accs = pickAccounts('pz');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 120000 });
  await pg.waitForTimeout(3000);
  await pg.evaluate((a) => {
    const A = document.getElementById('mp-acc'), P = document.getElementById('mp-pass');
    if (A && P) { A.value = a; P.value = '123456'; document.getElementById('mp-go').click(); }
  }, accs.a);
  await pg.waitForFunction(() => window.MP && window.MP.connected, null, { timeout: 30000 }).catch(() => { });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => { if (window.diorama) window.diorama.snow(false); });

  for (const s of SHOTS) {
    await pg.evaluate((s) => {
      window.diorama.fov(s.fov);
      window.MP.freezeCam(s.p[0], s.p[1], s.p[2], s.t[0], s.t[1], s.t[2]);
    }, s);
    await pg.waitForTimeout(1400);
    await pg.screenshot({ path: '/tmp/' + s.id + '.png' });
  }
  const st = await pg.evaluate(() => window.diorama.piano());
  console.log('钢琴状态 =', JSON.stringify(st));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
