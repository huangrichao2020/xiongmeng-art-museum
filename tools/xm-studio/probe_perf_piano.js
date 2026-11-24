/* 钢琴广场改造后的性能核对：桌面 + 小米视口 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/?ui';

const VIEWS = [
  { tag: 'desktop', w: 1280, h: 860 },
  { tag: 'phone', w: 393, h: 873 },
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  for (const v of VIEWS) {
    const accs = pickAccounts('pf');
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h }, isMobile: v.tag === 'phone', hasTouch: v.tag === 'phone' });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 120000 });
    await pg.waitForTimeout(2500);
    await pg.evaluate((a) => {
      const A = document.getElementById('mp-acc'), P = document.getElementById('mp-pass');
      if (A && P) { A.value = a; P.value = '123456'; document.getElementById('mp-go').click(); }
    }, accs.a);
    await pg.waitForFunction(() => window.MP && window.MP.connected, null, { timeout: 30000 }).catch(() => { });
    await pg.waitForTimeout(2500);
    // 全景基准
    await pg.evaluate(() => { window.diorama.fov(55); window.MP.freezeCam(-42, 22, 0, -43.5, 0, -12); });
    await pg.waitForTimeout(1500);
    const wide = await pg.evaluate(() => window.diorama.perf());
    // 钢琴近景
    await pg.evaluate(() => { window.diorama.fov(52); window.MP.freezeCam(-42.2, 1.45, -12.8, -44.5, 0.85, -12.2); });
    await pg.waitForTimeout(1500);
    const near = await pg.evaluate(() => window.diorama.perf());
    console.log(v.tag, 'wide=', JSON.stringify(wide), 'near=', JSON.stringify(near));
    console.log(v.tag, errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
    await ctx.close();
  }
  await b.close();
})();
