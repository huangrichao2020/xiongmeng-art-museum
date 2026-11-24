/* 牵手侧视图：确认伸出去的手臂 + 牵在一起的手 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || 'side');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
const login = async (pg, acc) => {
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.classList.remove('hide'); });
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc', acc); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2600);
};
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
  for (const pg of [A, B]) await pg.evaluate(() => { if (!window.diorama.fp.get().on) document.getElementById('t-fp').click(); });
  await A.waitForTimeout(700);
  await A.evaluate(() => window.diorama.fp.set(0, 0, 10, 0, 0));
  await B.evaluate(() => window.diorama.fp.set(0, 0, 11, 0, 0));
  await A.waitForTimeout(1400);
  await A.evaluate(() => MP.handAction());
  await A.waitForTimeout(700);
  await B.evaluate(() => MP.handRespond(true));
  await A.waitForTimeout(1500);
  await A.evaluate(() => MP.toggleThird());
  await A.waitForTimeout(600);
  /* 侧视：从右边看过去 */
  await A.evaluate(() => MP.freezeCam(3.4, 1.15, 10.3, 0.3, 0.72, 10));
  await A.waitForTimeout(900);
  await A.screenshot({ path: '/tmp/mp_hand_side.png' });
  console.log('[ok]', JSON.stringify(await A.evaluate(() => window.diorama.hand())));
  await b.close();
})();
