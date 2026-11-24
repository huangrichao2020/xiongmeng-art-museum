/* 手机端（393×873）牵手 HUD 位置与可点性 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || 'mob');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
const login = async (pg, acc) => {
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.classList.remove('hide'); });
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc', acc); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2600);
};
const rect = (pg, sel) => pg.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vis: getComputedStyle(el).display !== 'none' };
}, sel);
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const mc = await b.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const M = await mc.newPage();
  const D = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  M.on('pageerror', e => console.log('[M err]', String(e).slice(0, 160)));
  D.on('pageerror', e => console.log('[D err]', String(e).slice(0, 160)));
  await M.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await D.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await M.waitForFunction(() => window.MP, { timeout: 120000 });
  await D.waitForFunction(() => window.MP, { timeout: 120000 });
  await M.waitForTimeout(5000);
  await login(M, ACC.a); await login(D, ACC.b);
  await M.evaluate(() => { if (!window.diorama.fp.get().on) document.getElementById('t-fp').click(); });
  await D.evaluate(() => { if (!window.diorama.fp.get().on) document.getElementById('t-fp').click(); });
  await M.waitForTimeout(800);
  await M.evaluate(() => window.diorama.fp.set(0, 0, 10, 0, 0));
  await D.evaluate(() => window.diorama.fp.set(0, 0, 11, 0, 0));
  await M.waitForTimeout(1600);
  console.log('[手机 摇杆]', JSON.stringify(await rect(M, '#joystick')));
  console.log('[手机 牵手条]', JSON.stringify(await rect(M, '#hand-hud')));
  console.log('[手机 牵手按钮]', JSON.stringify(await rect(M, '#hand-act')));
  console.log('[手机 提示文案]', JSON.stringify(await M.evaluate(() => document.querySelector('#hand-msg').textContent)));
  await M.screenshot({ path: '/tmp/mp_hand_mobile.png' });

  /* 手机上点「牵手」按钮 → 桌面端应收到请求 */
  await M.click('#hand-act');
  await M.waitForTimeout(900);
  console.log('[桌面 收到请求]', JSON.stringify(await D.evaluate(() => ({ pFrom: MP.hand.pendingFrom, msg: document.querySelector('#hand-msg').textContent, btns: document.querySelector('#hand-btns').style.display }))));
  console.log('[桌面 同意按钮]', JSON.stringify(await rect(D, '#hand-yes')));
  await D.screenshot({ path: '/tmp/mp_hand_ask.png' });
  /* 点同意 */
  await D.click('#hand-yes');
  await M.waitForTimeout(1400);
  console.log('[配对后 手机]', JSON.stringify(await M.evaluate(() => ({ role: MP.hand.role, partner: MP.hand.partner, fp: window.diorama.fp.get() }))));
  console.log('[配对后 桌面]', JSON.stringify(await D.evaluate(() => ({ role: MP.hand.role, partner: MP.hand.partner, fp: window.diorama.fp.get() }))));
  await M.screenshot({ path: '/tmp/mp_hand_mobile_paired.png' });
  await D.screenshot({ path: '/tmp/mp_hand_desk_paired.png' });
  await b.close();
})();
