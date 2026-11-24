/* 牵手后两个人在各自客户端里看到的对方位置 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || 'pos');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
const login = async (pg, acc) => {
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.classList.remove('hide'); });
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc', acc); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2600);
};
const dump = (pg, other) => pg.evaluate(acc => {
  const p = MP.peers.get(acc);
  const f = window.diorama.fp.get();
  return {
    myFp: [f.x, f.z],
    peerExists: !!p,
    peerTarget: p ? [+p.target.x.toFixed(2), +p.target.z.toFixed(2)] : null,
    peerCur: p ? [+p.cur.x.toFixed(2), +p.cur.z.toFixed(2)] : null,
    peerGroup: p ? [+p.group.position.x.toFixed(2), +p.group.position.z.toFixed(2)] : null,
    dist: p ? +Math.hypot(p.cur.x - f.x, p.cur.z - f.z).toFixed(2) : null,
    third: MP.third, hasSelf: !!MP.self,
  };
}, other);
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const A = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  const B = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
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
  await A.waitForTimeout(1600);
  console.log('[配对前 A]', JSON.stringify(await dump(A, ACC.b)));
  console.log('[配对前 B]', JSON.stringify(await dump(B, ACC.a)));
  await A.evaluate(() => MP.handAction());
  await A.waitForTimeout(700);
  await B.evaluate(() => MP.handRespond(true));
  await A.waitForTimeout(1600);
  console.log('[配对后 A]', JSON.stringify(await dump(A, ACC.b)));
  console.log('[配对后 B]', JSON.stringify(await dump(B, ACC.a)));
  await b.close();
})();
