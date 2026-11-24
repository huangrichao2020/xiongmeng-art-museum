/* 全服统一时间 · 端到端验收
   ─────────────────────────────────────────────────────────────
   核心命题：同一个物理时刻，不同客户端看到的表演进度必须一致。

   验证方法（比「两个页面各跑各的再对比」更硬）：
     1) 先算出未来的一个绝对时刻 at（两台设备在同一台机器上，Date.now 基准相同）
     2) 两端各自等到 Date.now() >= at 的那一刻才读数
     3) 那一刻读到的 t / 旋转木马角度 / 马戏团幕次 / 钟针角度必须一致
   如果还各转各的，角度就会差一大截（0.72 rad/s，差 1 秒就是 41 度）。

   顺便验证：服务端时间校准生效（calib / bestRtt / off）。 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.CLK_URL || 'https://preview.ai10088.com/alex-garage/?ui';

(async () => {
  const accs = pickAccounts('clk');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const errs = [];
  const pages = [];

  const open = async (ctx, name, acct) => {
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(name + ' ' + String(e).slice(0, 200)));
    pg.on('console', m => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text().slice(0, 160)); });
    await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction(() => window.MP, null, { timeout: 120000 });
    await pg.waitForTimeout(3000);
    await pg.evaluate(async (a) => {
      const acc = document.getElementById('mp-acc'), pw = document.getElementById('mp-pass');
      if (acc && pw) { acc.value = a; pw.value = '123456'; document.getElementById('mp-go').click(); }
    }, acct);
    const ok = await pg.waitForFunction(() => window.MP && window.MP.connected, null, { timeout: 30000 }).then(() => true).catch(() => false);
    console.log(name, '登录 =', ok, '账号 =', acct);
    pages.push({ name, pg });
    return pg;
  };

  const dctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const mctx = await b.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await open(dctx, 'desktop', accs.a);
  await open(mctx, 'mobile', accs.b);

  /* 等时钟校准生效（首次 /time 或连上后的 pong 都行） */
  for (const { name, pg } of pages) {
    await pg.waitForFunction(() => window.diorama && window.diorama.time().calib, null, { timeout: 30000 }).catch(() => { });
    const st = await pg.evaluate(() => window.diorama.time());
    console.log(name, '时间状态 =', JSON.stringify(st));
  }

  /* 取一个未来的绝对时刻，两端都在那一刻读数 */
  const at = Date.now() + 6000;
  const read = async (pg) => pg.evaluate((at) => new Promise(res => {
    const tick = () => {
      const now = Date.now();
      if (now >= at) {
        const tm = window.diorama.time();
        res({ hitAt: now, t: tm.t, carousel: tm.carousel, act: tm.circusAct, clock: tm.clock, off: tm.off });
      } else setTimeout(tick, 4);
    };
    tick();
  }), at);

  const [d, m] = await Promise.all(pages.map(p => read(p.pg)));
  console.log('\n同一绝对时刻读数：');
  console.log('  desktop =', JSON.stringify(d));
  console.log('  mobile  =', JSON.stringify(m));

  const diffT = Math.abs(d.t - m.t);
  const diffAng = Math.abs((d.carousel ?? 0) - (m.carousel ?? 0));
  console.log('\n差值：');
  console.log('  全局相位 t  =', diffT.toFixed(4), '秒');
  console.log('  旋转木马角度 =', (diffAng * 180 / Math.PI).toFixed(3), '度');
  console.log('  马戏团幕次  =', d.act, '/', m.act, d.act === m.act ? '一致' : '不一致');

  /* 再看 3 秒后是否仍然同步（验证是持续对齐，不是一次巧合） */
  const at2 = Date.now() + 3000;
  const read2 = async (pg) => pg.evaluate((at) => new Promise(res => {
    const tick = () => {
      if (Date.now() >= at) { const tm = window.diorama.time(); res({ t: tm.t, carousel: tm.carousel, act: tm.circusAct }); }
      else setTimeout(tick, 4);
    };
    tick();
  }), at2);
  const [d2, m2] = await Promise.all(pages.map(p => read2(p.pg)));
  console.log('\n3 秒后再测：');
  console.log('  desktop =', JSON.stringify(d2));
  console.log('  mobile  =', JSON.stringify(m2));
  console.log('  相位差 =', Math.abs(d2.t - m2.t).toFixed(4), '秒；角度差 =',
    (Math.abs((d2.carousel ?? 0) - (m2.carousel ?? 0)) * 180 / Math.PI).toFixed(3), '度');

  await b.close();
  console.log(errs.length ? '\nERRORS:\n' + errs.join('\n') : '\nno page errors');
})();
