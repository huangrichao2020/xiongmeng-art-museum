/* 用户场景回归：牵→松→再牵（第一人称）、取消请求、对方掉线自愈 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || 'fin');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
const login = async (pg, acc) => {
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.classList.remove('hide'); });
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc', acc); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2600);
};
const st = pg => pg.evaluate(() => {
  const h = document.getElementById('hand-hud');
  return { role: MP.hand.role, partner: MP.hand.partner, pTo: MP.hand.pendingTo, pFrom: MP.hand.pendingFrom,
    btn: h ? h.querySelector('#hand-act').textContent : '', name: h ? h.querySelector('#hand-name').textContent : '',
    on: !!(h && h.classList.contains('show')) };
});
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const A = await (await b.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true })).newPage();
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
  await A.waitForTimeout(1500);

  console.log('=== 1) 牵手 ===');
  await A.click('#hand-act'); await A.waitForTimeout(800);
  console.log('[B 收到]', JSON.stringify(await st(B)));
  await B.click('#hand-yes'); await A.waitForTimeout(1200);
  console.log('[A]', JSON.stringify(await st(A)), '[B]', JSON.stringify(await st(B)));

  console.log('=== 2) 松手 ===');
  await A.click('#hand-act'); await A.waitForTimeout(1200);
  console.log('[A]', JSON.stringify(await st(A)), '[B]', JSON.stringify(await st(B)));

  console.log('=== 3) 再牵手 ===');
  await A.click('#hand-act'); await A.waitForTimeout(800);
  console.log('[A 发起]', JSON.stringify(await st(A)), '[B]', JSON.stringify(await st(B)));
  await B.click('#hand-yes'); await A.waitForTimeout(1300);
  console.log('[A]', JSON.stringify(await st(A)), '[B]', JSON.stringify(await st(B)));

  console.log('=== 4) 取消请求 ===');
  await A.click('#hand-act'); await A.waitForTimeout(1200);   // 松手
  await A.click('#hand-act'); await A.waitForTimeout(800);    // 发起
  console.log('[A 等待中]', JSON.stringify(await st(A)));
  await A.click('#hand-act'); await A.waitForTimeout(800);    // 取消
  console.log('[A 取消后]', JSON.stringify(await st(A)), '[B]', JSON.stringify(await st(B)));
  await A.click('#hand-act'); await A.waitForTimeout(800);    // 重新发起
  await B.click('#hand-yes'); await A.waitForTimeout(1200);
  console.log('[A 再牵上]', JSON.stringify(await st(A)), '[B]', JSON.stringify(await st(B)));

  console.log('=== 5) 对方掉线自愈 ===');
  await B.evaluate(() => { try { MP.ws.close(); } catch (e) { } });
  await A.waitForTimeout(7000);
  console.log('[A 自愈后]', JSON.stringify(await st(A)));
  await b.close();
})();
