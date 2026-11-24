/* 牵手 → 松手 → 再牵手，第二次为什么牵不上 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || 'retry');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
const login = async (pg, acc) => {
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.classList.remove('hide'); });
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc', acc); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2600);
};
const tap = pg => pg.evaluate(() => {
  const orig = MP.onMsg;
  MP.onMsg = function (m) {
    (window.__msgs = window.__msgs || []).push(m.t + (m.code ? '/' + m.code : '') + (m.msg ? '/' + m.msg : ''));
    return orig.call(this, m);
  };
});
const st = pg => pg.evaluate(() => ({
  role: MP.hand.role, partner: MP.hand.partner,
  pTo: MP.hand.pendingTo, pFrom: MP.hand.pendingFrom,
  msgs: (window.__msgs || []).slice(-8),
}));
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const A = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  const B = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  A.on('pageerror', e => console.log('[A err]', String(e).slice(0, 160)));
  B.on('pageerror', e => console.log('[B err]', String(e).slice(0, 160)));
  await A.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await B.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await A.waitForFunction(() => window.MP, { timeout: 120000 });
  await B.waitForFunction(() => window.MP, { timeout: 120000 });
  await A.waitForTimeout(5000);
  await login(A, ACC.a); await login(B, ACC.b);
  await tap(A); await tap(B);
  for (const pg of [A, B]) await pg.evaluate(() => { if (!window.diorama.fp.get().on) document.getElementById('t-fp').click(); });
  await A.waitForTimeout(700);
  await A.evaluate(() => window.diorama.fp.set(0, 0, 10, 0, 0));
  await B.evaluate(() => window.diorama.fp.set(0, 0, 11, 0, 0));
  await A.waitForTimeout(1500);

  console.log('--- 第一轮 ---');
  await A.evaluate(() => MP.handAction());
  await A.waitForTimeout(800);
  await B.evaluate(() => MP.handRespond(true));
  await A.waitForTimeout(1200);
  console.log('[A]', JSON.stringify(await st(A)));
  console.log('[B]', JSON.stringify(await st(B)));

  console.log('--- 松手 ---');
  await A.click('#hand-act');
  await A.waitForTimeout(1200);
  console.log('[A]', JSON.stringify(await st(A)));
  console.log('[B]', JSON.stringify(await st(B)));

  console.log('--- 第二轮 ---');
  await A.evaluate(() => MP.handAction());
  await A.waitForTimeout(900);
  console.log('[A 发起后]', JSON.stringify(await st(A)));
  console.log('[B 收到后]', JSON.stringify(await st(B)));
  await B.evaluate(() => MP.handRespond(true));
  await A.waitForTimeout(1200);
  console.log('[A]', JSON.stringify(await st(A)));
  console.log('[B]', JSON.stringify(await st(B)));
  await b.close();
})();
