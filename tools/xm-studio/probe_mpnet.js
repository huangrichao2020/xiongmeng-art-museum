/* 断线提示条可见性 + draw call 观测 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || '');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';
const cp = require('child_process');

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 760 } });
  const pg = await c.newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 160)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(4000);
  await pg.fill('#mp-acc', ACC.a); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => MP.toggleThird());
  await pg.waitForTimeout(2500);

  const draws = await pg.evaluate(() => {
    const r = window.__r || null;
    return { calls: (window.__calls || 0) };
  });
  console.log('[第三人称 drawcalls 采样]', JSON.stringify(draws));

  /* 把服务端停掉 → 断线提示条应该立刻出现 */
  cp.execSync('ssh -o BatchMode=yes aliyun "systemctl stop xm-ws"', { timeout: 30000 });
  await pg.waitForTimeout(2500);
  const net = await pg.evaluate(() => {
    const el = document.getElementById('mp-net');
    return {
      exists: !!el, on: !!(el && el.classList.contains('on')),
      text: el ? el.textContent.trim() : '',
      rect: el ? (() => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })() : null,
      conn: MP.connected,
    };
  });
  console.log('[断线提示条]', JSON.stringify(net));
  await pg.screenshot({ path: '/tmp/mp_offline.png' });

  /* 恢复服务端 → 客户端应自动接回 */
  cp.execSync('ssh -o BatchMode=yes aliyun "systemctl start xm-ws"', { timeout: 30000 });
  let back = null;
  for (let i = 0; i < 30; i++) {
    await pg.waitForTimeout(1000);
    const s = await pg.evaluate(() => ({ conn: MP.connected, ws: MP.ws && MP.ws.readyState, tries: MP.tries }));
    if (s.conn) { back = { sec: i + 1, ...s }; break; }
  }
  console.log('[服务端恢复后自动接回]', JSON.stringify(back));
  const net2 = await pg.evaluate(() => {
    const el = document.getElementById('mp-net');
    return { on: !!(el && el.classList.contains('on')) };
  });
  console.log('[恢复后提示条隐藏]', JSON.stringify(net2));
  await b.close();
})();
