/* 双端同步回归：B 用 setLocalPos 走动，A 看收到的坐标/速度/动画 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || '');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const login = async (pg, acc) => {
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.classList.remove('hide'); });
  await pg.waitForSelector('#mp-acc');
  await pg.fill('#mp-acc', acc); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2500);
};
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const A = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  const B = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  A.on('pageerror', e => console.log('[A err]', String(e).slice(0, 140)));
  B.on('pageerror', e => console.log('[B err]', String(e).slice(0, 140)));
  await A.goto('https://preview.ai10088.com/alex-garage/', { waitUntil: 'load', timeout: 120000 });
  await B.goto('https://preview.ai10088.com/alex-garage/', { waitUntil: 'load', timeout: 120000 });
  await A.waitForFunction(() => window.MP, { timeout: 120000 });
  await B.waitForFunction(() => window.MP, { timeout: 120000 });
  await A.waitForTimeout(5000);
  await login(A, ACC.a); await login(B, ACC.b);
  await A.evaluate(() => MP.toggleThird());
  await B.evaluate(() => MP.toggleThird());
  await B.evaluate(() => MP.setLocalPos(0, 0, 10, 0));
  await A.waitForTimeout(1500);
  /* B 连续走（每 100ms 挪 0.35m），让对端算出真实速度并播走路动画 */
  await B.evaluate(() => {
    let z = 10;
    window.__mv = setInterval(() => { z -= .35; MP.setLocalPos(0, 0, z, 0); }, 100);
  });
  await A.waitForTimeout(2500);
  const s1 = await A.evaluate((acc) => {
    const p = MP.peers.get(acc); if (!p) return null;
    return {
      target: [p.target.x, p.target.y, p.target.z],
      cur: [+p.cur.x.toFixed(2), +p.cur.z.toFixed(2)],
      rawSpeed: p.rawSpeed !== undefined ? +p.rawSpeed.toFixed(2) : null,
      bodyY: +p.group.userData.bodyGrp.position.y.toFixed(4),
      shoulder0X: +p.group.userData.shoulders[0].rotation.x.toFixed(3),
      peerMeshes: (() => { let n = 0; p.group.traverse(o => { if (o.isMesh) n++; }); return n; })(),
    };
  }, ACC.b);
  console.log('[A 看到的 B]', JSON.stringify(s1));
  await A.screenshot({ path: '/tmp/mp_peer_walk.png' });
  await b.close();
})();
