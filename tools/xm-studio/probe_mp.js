/* 双客户端联调：开两个浏览器上下文
   A 用 test01，B 用 test02
   验证：登录成功 → 互相看到 → 移动能看到对方动 → 同号顶号 → 改 ID
   用法: node probe_mp.js <url> */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctxA = await b.newContext({ viewport: { width: 900, height: 600 } });
  const ctxB = await b.newContext({ viewport: { width: 900, height: 600 } });
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  const errs = { A: 0, B: 0 };
  A.on('pageerror', e => { errs.A++; console.log('[A pageerror]', String(e).slice(0, 200)); });
  B.on('pageerror', e => { errs.B++; console.log('[B pageerror]', String(e).slice(0, 200)); });
  A.on('console', m => { if (m.type() === 'error') console.log('[A err]', m.text().slice(0, 160)); });

  const url = process.argv[2] || 'https://preview.ai10088.com/alex-garage/';
  console.log('打开', url);
  await A.goto(url, { waitUntil: 'load', timeout: 120000 });
  await B.goto(url, { waitUntil: 'load', timeout: 120000 });
  await A.waitForFunction(() => window.XM && window.MP, { timeout: 120000 });
  await B.waitForFunction(() => window.XM && window.MP, { timeout: 120000 });
  await A.waitForTimeout(6000);

  const hasLogin = await A.evaluate(() => !!document.getElementById('mp-login'));
  console.log('登录页存在 =', hasLogin);
  await A.screenshot({ path: '/tmp/mp_login.png' });

  // 登录
  async function login(page, acc) {
    await page.evaluate(() => {
      const w = document.getElementById('mp-login');
      if (w) w.classList.remove('hide');
    });
    await page.waitForSelector('#mp-acc', { timeout: 10000 });
    await page.fill('#mp-acc', acc);
    await page.fill('#mp-pass', '123456');
    await page.click('#mp-go');
  }
  await login(A, 'test01');
  await A.waitForTimeout(1500);
  await login(B, 'test02');
  await B.waitForTimeout(2500);

  const st = await A.evaluate(() => ({
    connected: MP.connected,
    account: MP.account,
    display: MP.display,
    peers: [...MP.peers.keys()],
    peerDisplay: [...MP.peers.values()].map(p => p.display),
    panelText: (document.getElementById('mp-panel') || {}).innerText
  }));
  console.log('A 状态 =', JSON.stringify(st));

  const stB = await B.evaluate(() => ({
    connected: MP.connected, account: MP.account,
    peers: [...MP.peers.keys()],
    peerDisplay: [...MP.peers.values()].map(p => p.display)
  }));
  console.log('B 状态 =', JSON.stringify(stB));

  // 让 B 移动，看 A 是否收到
  const before = await A.evaluate(() => {
    const p = [...MP.peers.values()][0];
    return p ? { x: p.target.x, z: p.target.z } : null;
  });
  await B.evaluate(() => {
    MP.setLocalPos(5, 0, -12, 0.8);
  });
  await B.waitForTimeout(1500);
  const after = await A.evaluate(() => {
    const p = [...MP.peers.values()][0];
    return p ? { x: p.target.x, z: p.target.z, curX: p.cur.x, curZ: p.cur.z, groupY: p.group.position.y } : null;
  });
  console.log('A 看到的队友位置 before =', JSON.stringify(before), ' after =', JSON.stringify(after));

  // 第三人称
  await A.evaluate(() => MP.toggleThird());
  await A.waitForTimeout(2000);
  const tp = await A.evaluate(() => MP.debug());
  console.log('A 第三人称 =', JSON.stringify(tp));
  await A.screenshot({ path: '/tmp/mp_third_A.png' });

  // B 也开第三人称，看得到 A 的角色
  await B.evaluate(() => MP.toggleThird());
  await B.waitForTimeout(2500);
  await B.screenshot({ path: '/tmp/mp_third_B.png' });
  const bView = await B.evaluate(() => {
    const d = MP.debug();
    const p = d.peers[d.account === 'test01' ? 'test01' : Object.keys(d.peers)[0]];
    return { peerVisible: p ? true : null, peerPos: p ? p.groupPos : null, dist: p ? p.distToCam : null, tagOpacity: p ? p.tagOpacity : null, peerScreen: p ? p.screen : null };
  });
  console.log('B 看到的 A =', JSON.stringify(bView));

  // 改 ID
  await A.fill('#mp-name', '熊萌一号');
  await A.click('#mp-save');
  await A.waitForTimeout(1200);
  const renamed = await B.evaluate(() => [...MP.peers.values()].map(p => p.display));
  console.log('B 看到的 A 的新 ID =', JSON.stringify(renamed));

  // 同号顶号：C 用 test01 登录，A 应被踢
  const ctxC = await b.newContext({ viewport: { width: 900, height: 600 } });   // 独立 context，不共享 localStorage
  const C = await ctxC.newPage();
  await C.goto(url, { waitUntil: 'load', timeout: 120000 });
  await C.waitForFunction(() => window.XM && window.MP, { timeout: 120000 });
  await C.waitForTimeout(5000);
  await C.evaluate(() => { localStorage.removeItem('xm_mp_acc'); localStorage.removeItem('xm_mp_pass'); });
  await login(C, 'test01');
  await C.waitForTimeout(3000);
  const aKicked = await A.evaluate(() => ({
    connected: MP.connected,
    loginVisible: !document.getElementById('mp-login').classList.contains('hide'),
    msg: (document.getElementById('mp-msg') || {}).textContent
  }));
  console.log('A 被踢状态 =', JSON.stringify(aKicked));
  await A.screenshot({ path: '/tmp/mp_kicked.png' });

  console.log('页面错误 A/B =', errs.A, errs.B);
  await b.close();
})();
