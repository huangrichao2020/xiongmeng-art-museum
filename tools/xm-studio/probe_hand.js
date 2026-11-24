/* 牵手联动回归：A 发起 → B 同意 → B 完全跟着 A 走 → 松手 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || 'hand');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';
const login = async (pg, acc) => {
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.classList.remove('hide'); });
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc', acc); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2600);
};
const handState = pg => pg.evaluate(() => ({
  role: MP.hand.role, partner: MP.hand.partner, pTo: MP.hand.pendingTo, pFrom: MP.hand.pendingFrom,
  hud: (() => { const h = document.getElementById('hand-hud'); return { on: !!(h && h.classList.contains('show')), msg: h ? h.querySelector('#hand-name').textContent : '', btns: h ? h.querySelector('#hand-btns').style.display : '', act: h ? h.querySelector('#hand-act').style.display : '' }; })(),
}));
const walk = async pg => {
  await pg.evaluate(() => { if (!window.diorama.fp.get().on) document.getElementById('t-fp').click(); });
  await pg.waitForTimeout(600);
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
  await walk(A); await walk(B);
  await A.evaluate(() => MP.toggleThird());
  await B.evaluate(() => MP.toggleThird());
  await A.evaluate(() => window.diorama.fp.set(0, 0, 10, 0, 0));
  await B.evaluate(() => window.diorama.fp.set(0, 0, 11, 0, 0));
  await A.waitForTimeout(1600);
  console.log('[walk 状态]', JSON.stringify(await A.evaluate(() => ({ on: window.diorama.fp.get().on, third: MP.third, self: !!MP.self }))));
  console.log('[A 看到的最近玩家]', JSON.stringify(await A.evaluate(() => { const p = MP.nearestPeer(); const f = window.diorama.fp.get(); return p ? { acc: p.account, d: +Math.hypot(p.cur.x - f.x, p.cur.z - f.z).toFixed(2) } : null; })));
  console.log('[A HUD(靠近)]', JSON.stringify(await handState(A)));

  /* A 发起 */
  await A.evaluate(() => MP.handAction());
  await A.waitForTimeout(900);
  console.log('[A 发起后]', JSON.stringify(await handState(A)));
  console.log('[B 收到请求]', JSON.stringify(await handState(B)));

  /* B 同意 */
  await B.evaluate(() => MP.handRespond(true));
  await A.waitForTimeout(1500);
  console.log('[A 配对后]', JSON.stringify(await handState(A)));
  console.log('[B 配对后]', JSON.stringify(await handState(B)));

  /* A 往前走 3 米 */
  await A.evaluate(() => window.diorama.fp.set(0, 0, 13, 0, 0));
  await A.waitForTimeout(1700);
  const posA = await A.evaluate(() => ({ fp: window.diorama.fp.get(), self: [+MP.self.position.x.toFixed(3), +MP.self.position.z.toFixed(3)], rot: +MP.self.rotation.y.toFixed(3) }));
  const posB = await B.evaluate(() => ({ fp: window.diorama.fp.get(), self: MP.self ? [+MP.self.position.x.toFixed(3), +MP.self.position.z.toFixed(3)] : null, rot: MP.self ? +MP.self.rotation.y.toFixed(3) : null, link: window.diorama.hand().link }));
  console.log('[A 位置]', JSON.stringify(posA));
  console.log('[B 位置]', JSON.stringify(posB));
  const dx = posA.self[0] - posB.self[0], dz = posA.self[1] - posB.self[1];
  console.log('[两人间距]', JSON.stringify({ d: +Math.hypot(dx, dz).toFixed(3) }));

  /* B 试图自己走 —— 应该被拽回去 */
  await B.evaluate(() => window.diorama.fp.set(8, 0, 8, 0, 0));
  await B.waitForTimeout(700);
  console.log('[B 试图自己走之后]', JSON.stringify(await B.evaluate(() => window.diorama.fp.get())));

  /* 手臂姿势 + 礼物盒 */
  const arms = pg => pg.evaluate(() => {
    const sh = MP.self.userData.shoulders;
    const g = i => sh[i].userData.gift ? sh[i].userData.gift.map(m => m.visible) : null;
    return { r0: [+sh[0].rotation.x.toFixed(2), +sh[0].rotation.z.toFixed(2)], r1: [+sh[1].rotation.x.toFixed(2), +sh[1].rotation.z.toFixed(2)], gift0: g(0), gift1: g(1) };
  });
  console.log('[A 手臂]', JSON.stringify(await arms(A)));
  console.log('[B 手臂]', JSON.stringify(await arms(B)));
  console.log('[A 看到的 B 的手臂]', JSON.stringify(await A.evaluate((acc) => {
    const p = MP.peers.get(acc); if (!p) return null;
    const sh = p.group.userData.shoulders;
    const g = i => sh[i].userData.gift ? sh[i].userData.gift.map(m => m.visible) : null;
    return { r0: [+sh[0].rotation.x.toFixed(2), +sh[0].rotation.z.toFixed(2)], r1: [+sh[1].rotation.x.toFixed(2), +sh[1].rotation.z.toFixed(2)], gift1: g(1) };
  }, ACC.b)));

  await A.screenshot({ path: '/tmp/mp_hand_leader.png' });
  await B.screenshot({ path: '/tmp/mp_hand_follower.png' });

  /* 松手（点按钮，不是调函数）*/
  await A.click('#hand-act');
  await A.waitForTimeout(200);
  await A.waitForTimeout(1300);
  console.log('[松手后 A]', JSON.stringify(await handState(A)));
  console.log('[松手后 B]', JSON.stringify(await handState(B)));
  /* 松手后普通同步还要正常（之前 UI 绑定 bug 会把位置广播打断）*/
  await B.evaluate(() => window.diorama.fp.set(0, 0, 18, 0, 0));
  await B.waitForTimeout(1500);
  console.log('[松手后 A 看到的 B]', JSON.stringify(await A.evaluate((acc) => { const p = MP.peers.get(acc); return p ? [+p.cur.x.toFixed(2), +p.cur.z.toFixed(2)] : null; }, ACC.b)));
  await b.close();
})();
