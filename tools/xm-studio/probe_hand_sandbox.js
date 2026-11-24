/* 1) 沙盘模式收到牵手请求，提示必须一直显示（老 bug：0.12 秒后被藏掉）
   2) 旧版本标签页 → 登录后弹「刷新」提示 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || 'sbx');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
const login = async (pg, acc) => {
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.classList.remove('hide'); });
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc', acc); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2600);
};
const hud = pg => pg.evaluate(() => {
  const h = document.getElementById('hand-hud');
  return { on: !!(h && h.classList.contains('show')), msg: h ? h.querySelector('#hand-msg').textContent : '', btns: h ? h.querySelector('#hand-btns').style.display : '' };
});
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const A = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  const B = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  A.on('pageerror', e => console.log('[A err]', String(e).slice(0, 160)));
  B.on('pageerror', e => console.log('[B err]', String(e).slice(0, 160)));
  /* B 假装自己是旧版本 */
  await B.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const m = document.querySelector('meta[name="xm-build"]');
      if (m) m.content = 'boldbuild';
    });
  });
  await A.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await B.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await A.waitForFunction(() => window.MP, { timeout: 120000 });
  await B.waitForFunction(() => window.MP, { timeout: 120000 });
  await A.waitForTimeout(5000);
  await login(A, ACC.a); await login(B, ACC.b);
  console.log('[B 版本提示]', JSON.stringify(await B.evaluate(() => {
    const el = document.getElementById('xm-upd');
    return { on: !!(el && el.classList.contains('on')), txt: el ? el.textContent.trim() : '', mine: document.querySelector('meta[name="xm-build"]').content };
  })));
  /* A 进沉浸，B 留在沙盘 */
  await A.evaluate(() => { if (!window.diorama.fp.get().on) document.getElementById('t-fp').click(); });
  await A.waitForTimeout(700);
  await A.evaluate(() => window.diorama.fp.set(1, 0, 0, 0, 0));
  await A.waitForTimeout(1500);
  console.log('[A 最近玩家]', JSON.stringify(await A.evaluate(() => { const p = MP.nearestPeer(); return p ? { acc: p.account, d: +Math.hypot(p.cur.x - 0, p.cur.z - 0).toFixed(2) } : null; })));
  await A.evaluate(() => MP.handAction());
  await A.waitForTimeout(1200);
  console.log('[B 收到请求 立刻]', JSON.stringify(await hud(B)));
  await B.waitForTimeout(2500);
  console.log('[B 收到请求 2.5秒后(关键)]', JSON.stringify(await hud(B)));
  await B.screenshot({ path: '/tmp/mp_hand_sandbox.png' });
  /* B 同意 */
  await B.evaluate(() => MP.handRespond(true));
  await A.waitForTimeout(1400);
  console.log('[A 配对]', JSON.stringify(await A.evaluate(() => ({ role: MP.hand.role, partner: MP.hand.partner }))));
  console.log('[B 配对]', JSON.stringify(await B.evaluate(() => ({ role: MP.hand.role, partner: MP.hand.partner }))));
  await b.close();
})();
