/* 本轮验收：角色加装/瘦身 + 弱网重连 + 强制登录 + ID 持久化 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || '');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 760 } });
  const pg = await c.newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 200)));
  pg.on('console', m => { if (m.type() === 'error') console.log('[console]', String(m.text()).slice(0, 200)); });

  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(4000);

  /* ── 1. 非联网模式是否彻底没了 ── */
  const ui = await pg.evaluate(() => ({
    hasSkip: !!document.getElementById('mp-skip'),
    skipText: (document.getElementById('mp-skip') || {}).textContent || null,
    cardVisible: !!(document.getElementById('mp-login') && !document.getElementById('mp-login').classList.contains('hide')),
    buttons: [...document.querySelectorAll('#mp-login button')].map(b => b.textContent.trim()),
  }));
  console.log('[登录界面]', JSON.stringify(ui));

  /* ── 2. 登录 ── */
  await pg.fill('#mp-acc', ACC.a); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2500);
  const st1 = await pg.evaluate(() => ({ conn: MP.connected, acc: MP.account, disp: MP.display, ws: MP.ws && MP.ws.readyState }));
  console.log('[登录后]', JSON.stringify(st1));

  /* ── 3. 第三人称 + 角色特写（正面/背面） ── */
  await pg.evaluate(() => { MP.toggleThird(); });
  await pg.waitForTimeout(1500);
  const box = await pg.evaluate(() => {
    const g = MP.self;
    if (!g) return null;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, minz = 1e9, maxz = -1e9, meshes = 0;
    g.updateWorldMatrix(true, true);
    g.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      minx = Math.min(minx, bb.min.x); maxx = Math.max(maxx, bb.max.x);
      miny = Math.min(miny, bb.min.y); maxy = Math.max(maxy, bb.max.y);
      minz = Math.min(minz, bb.min.z); maxz = Math.max(maxz, bb.max.z);
    });
    const p = g.position;
    return {
      meshes,
      w: +(maxx - minx).toFixed(3), h: +(maxy - miny).toFixed(3), d: +(maxz - minz).toFixed(3),
      bottom: +(miny - p.y).toFixed(3), top: +(maxy - p.y).toFixed(3),
      pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
      yaw: +g.rotation.y.toFixed(3),
    };
  });
  console.log('[角色包围盒]', JSON.stringify(box));

  /* 正面：相机放在模型朝向的一侧 */
  await pg.evaluate(() => {
    const g = MP.self, p = g.position;
    const yaw = g.rotation.y;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    MP.freezeCam(p.x + fx * 2.0, p.y + 1.05, p.z + fz * 2.0, p.x, p.y + 0.95, p.z);
  });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: '/tmp/mp_avatar_front.png' });
  /* 背面 */
  await pg.evaluate(() => {
    const g = MP.self, p = g.position;
    const yaw = g.rotation.y;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    MP.freezeCam(p.x - fx * 2.0, p.y + 1.05, p.z - fz * 2.0, p.x, p.y + 0.95, p.z);
  });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: '/tmp/mp_avatar_back.png' });

  /* ── 4. 断线 → 自动重连 + 提示条 ── */
  const before = await pg.evaluate(() => ({ gen: MP.gen, tries: MP.tries }));
  await pg.evaluate(() => { MP.ws.close(); });          // 模拟真实掉线
  await pg.waitForTimeout(1200);
  const during = await pg.evaluate(() => ({
    netOn: !!(document.getElementById('mp-net') && document.getElementById('mp-net').classList.contains('on')),
    netText: (document.getElementById('mp-net') || {}).textContent || '',
    conn: MP.connected,
  }));
  console.log('[掉线瞬间]', JSON.stringify(during));
  await pg.waitForTimeout(6000);
  const after = await pg.evaluate(() => ({
    conn: MP.connected, gen: MP.gen, tries: MP.tries,
    netOn: !!(document.getElementById('mp-net') && document.getElementById('mp-net').classList.contains('on')),
    wsState: MP.ws && MP.ws.readyState,
  }));
  console.log('[重连后]', JSON.stringify({ before, after }));

  /* ── 4b. 服务端重启 → 客户端自己接回来 ── */
  const cp = require('child_process');
  cp.execSync('ssh -o BatchMode=yes aliyun "systemctl restart xm-ws"', { timeout: 30000 });
  console.log('[已重启服务端]');
  let recovered = null;
  for (let i = 0; i < 24; i++) {
    await pg.waitForTimeout(1000);
    const s = await pg.evaluate(() => ({ conn: MP.connected, ws: MP.ws && MP.ws.readyState, tries: MP.tries }));
    if (s.conn) { recovered = { sec: i + 1, ...s }; break; }
  }
  console.log('[服务端重启后恢复]', JSON.stringify(recovered));
  const netAfter = await pg.evaluate(() => {
    const el = document.getElementById('mp-net');
    return { netOn: !!(el && el.classList.contains('on')), text: el ? el.textContent : '' };
  });
  console.log('[恢复后提示条]', JSON.stringify(netAfter));

  /* ── 5. 改 ID → 本地存档 ── */
  const NEWID = '测试熊' + Math.floor(Math.random() * 900 + 100);
  await pg.evaluate(() => { MP._panel.p.classList.add('open'); });
  await pg.fill('#mp-name', NEWID);
  await pg.click('#mp-save');
  await pg.waitForTimeout(800);
  const saved = await pg.evaluate(() => ({
    map: localStorage.getItem('xm_mp_names'),
    disp: MP.display,
  }));
  console.log('[改ID后]', NEWID, JSON.stringify(saved));

  /* ── 6. 刷新页面 → 自动登录 + ID 还在 ── */
  await pg.reload({ waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(6000);
  const back = await pg.evaluate(() => ({
    conn: MP.connected, acc: MP.account, disp: MP.display,
    cardHidden: document.getElementById('mp-login').classList.contains('hide'),
    map: localStorage.getItem('xm_mp_names'),
  }));
  console.log('[刷新后]', JSON.stringify(back), '期望ID=', NEWID, back.disp === NEWID ? '✓ 保住了' : '✗ 丢了');

  await b.close();
})();
