/* 牵手矩阵：谁松手 / 谁再牵手 / 距离太远 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || 'mtx');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
const login = async (pg, acc) => {
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.classList.remove('hide'); });
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc', acc); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2600);
};
const st = pg => pg.evaluate(() => ({
  role: MP.hand.role, partner: MP.hand.partner,
  pTo: MP.hand.pendingTo, pFrom: MP.hand.pendingFrom,
  hud: (() => { const h = document.getElementById('hand-hud'); return { on: !!(h && h.classList.contains('show')), name: h ? h.querySelector('#hand-name').textContent : '', act: h ? h.querySelector('#hand-act').textContent : '' }; })(),
  near: (() => { const p = MP.nearestPeer(); return p ? +Math.hypot(p.cur.x - window.diorama.fp.get().x, p.cur.z - window.diorama.fp.get().z).toFixed(2) : null; })(),
}));
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const A = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  const B = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  A.on('pageerror', e => console.log('[A err]', String(e).slice(0, 160)));
  B.on('pageerror', e => console.log('[B err]', String(e).slice(0, 160)));
  await A.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await B.goto(URL_, { viewPort: null });
  await B.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await A.waitForFunction(() => window.MP, { timeout: 120000 });
  await B.waitForFunction(() => window.MP, { timeout: 120000 });
  await A.waitForTimeout(5000);
  await login(A, ACC.a); await login(B, ACC.b);
  for (const pg of [A, B]) await pg.evaluate(() => { if (!window.diorama.fp.get().on) document.getElementById('t-fp').click(); });
  await A.waitForTimeout(700);
  const put = async (pg, x, z) => pg.evaluate(([a, c]) => window.diorama.fp.set(a, 0, c, 0, 0), [x, z]);

  const pair = async (who) => {
    const R = who === 'A' ? A : B, S = who === 'A' ? B : A;
    await R.evaluate(() => MP.handAction());
    await R.waitForTimeout(700);
    await S.evaluate(() => MP.handRespond(true));
    await R.waitForTimeout(1100);
  };
  const release = async (who) => {
    const R = who === 'A' ? A : B;
    await R.click('#hand-act');
    await R.waitForTimeout(1100);
  };

  await put(A, 0, 10); await put(B, 0, 11);
  await A.waitForTimeout(1400);
  await pair('A');
  console.log('[配对1]', JSON.stringify(await st(A)), JSON.stringify(await st(B)));
  await release('A');
  console.log('[A松手后]', JSON.stringify(await st(A)), JSON.stringify(await st(B)));
  await pair('B');
  console.log('[B再牵手]', JSON.stringify(await st(A)), JSON.stringify(await st(B)));

  await release('B');
  console.log('[B松手后]', JSON.stringify(await st(A)), JSON.stringify(await st(B)));
  await pair('A');
  console.log('[A再牵手]', JSON.stringify(await st(A)), JSON.stringify(await st(B)));

  /* 距离太远的情况 */
  await release('A');
  await put(A, 0, 10); await put(B, 0, 20);   // 10m
  await A.waitForTimeout(1600);
  console.log('[拉开10米 A]', JSON.stringify(await st(A)));
  await A.evaluate(() => MP.handAction());
  await A.waitForTimeout(600);
  console.log('[A 强行牵手]', JSON.stringify(await st(A)));
  await b.close();
})();
