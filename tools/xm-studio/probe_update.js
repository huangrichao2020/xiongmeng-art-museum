/* 线上更新按钮端到端验收
   桌面和手机两个端同时开着页面（都拿到部署前的旧版本），
   中途外部部署一次新的 index.html → 两端都应收到通知并弹出「立即更新」→
   点它 → 强制拉新版本重载 → 按钮消失。 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.UPD_URL || 'https://preview.ai10088.com/alex-garage/?ui';
const TAG = process.env.UPD_TAG || 'upd';

(async () => {
  const accs = pickAccounts(TAG);
  const acc = accs.a;
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const errs = [];
  const pages = [];

  const open = async (ctx, name, acct) => {
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(name + ' ' + String(e).slice(0, 180)));
    await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction(() => window.MP, null, { timeout: 120000 });
    await pg.waitForTimeout(4000);
    const tag0 = await pg.evaluate(() => (document.querySelector('meta[name="xm-build"]') || {}).content || '');
    await pg.evaluate(async (a) => {
      const acc = document.getElementById('mp-acc'), pw = document.getElementById('mp-pass');
      if (acc && pw) { acc.value = a; pw.value = '123456'; document.getElementById('mp-go').click(); }
    }, acct);
    const ok = await pg.waitForFunction(() => window.MP && window.MP.connected, null, { timeout: 30000 }).then(() => true).catch(() => false);
    /* 记录所有进来的消息类型和时间戳，用来分辨是推送到了还是轮询到的 */
    await pg.evaluate(() => {
      window.__log = [];
      const orig = window.MP.onMsg;
      window.MP.onMsg = function (m) { window.__log.push({ t: m.t, at: Date.now() }); return orig(m); };
    });
    console.log(name, '登录成功 =', ok, ' 部署前 tag =', tag0);
    pages.push({ name, pg });
    return pg;
  };

  const dctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const mctx = await b.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await open(dctx, 'desktop', accs.a);
  await open(mctx, 'mobile', accs.b);
  console.log('两台设备都已在线，等外部部署…');

  /* 等按钮（服务端推送 <8s，或最迟 30s 轮询） */
  const t0 = Date.now();
  const res = await Promise.all(pages.map(async ({ name, pg }) => {
    const got = await pg.waitForFunction(() => {
      const el = document.getElementById('xm-upd');
      return !!(el && el.classList.contains('on'));
    }, null, { timeout: 90000 }).then(() => true).catch(() => false);
    return { name, pg, got };
  }));
  console.log('两端等待总用时', ((Date.now() - t0) / 1000).toFixed(1), 's');
  for (const { name, pg, got } of res) {
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(name, '收到新版本通知 =', got, ' 用时', dt, 's');
    console.log(name, '消息流水 =', JSON.stringify(await pg.evaluate(() => (window.__log || []).filter(x => x.t !== 'ping' && x.t !== 'pong' && x.t !== 'move').slice(-8))));
    if (got) {
      const box = await pg.evaluate(() => {
        const el = document.getElementById('xm-upd');
        const r = el.getBoundingClientRect();
        return { txt: el.innerText.replace(/\s+/g, ' '), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight };
      });
      console.log(name, '按钮 =', JSON.stringify(box));
      await pg.screenshot({ path: '/tmp/upd_' + name + '.png' });
    }
  }

  /* 点「立即更新」→ 应强制拉新页面 */
  for (const { name, pg } of pages) {
    await pg.click('#xm-upd-btn').catch(() => { });
    await pg.waitForTimeout(6000);
    const after = await pg.evaluate(() => ({
      tag: (document.querySelector('meta[name="xm-build"]') || {}).content || '',
      url: location.href.slice(0, 120),
      btnOn: !!(document.getElementById('xm-upd') && document.getElementById('xm-upd').classList.contains('on'))
    }));
    console.log(name, '点按钮后 =', JSON.stringify(after));
    await pg.screenshot({ path: '/tmp/upd_after_' + name + '.png' });
  }

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
