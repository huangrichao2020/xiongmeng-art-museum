/* 本地冒烟：只验证页面加载无报错、牵手 API 存在 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'http://127.0.0.1:8899/index.html';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 760 } });
  const pg = await c.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 160)); });
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(4000);
  const st = await pg.evaluate(() => ({
    hasMP: !!window.MP,
    hand: window.MP ? JSON.parse(JSON.stringify(MP.hand)) : null,
    fns: ['handAction', 'handRespond', 'handEnd', 'handReset', 'nearestPeer', 'updateHandHud', 'handAnchor'].filter(k => typeof MP[k] === 'function'),
    hud: !!document.getElementById('hand-hud'),
    dioramaHand: typeof window.diorama.hand,
    bell: (() => { try { return String(window.MP && 'ok'); } catch (e) { return 'x'; } })(),
  }));
  console.log('[state]', JSON.stringify(st));
  /* 雪橇铃是否还在 */
  const bell = await pg.evaluate(() => {
    const src = document.documentElement.innerHTML;
    return { hasFn: src.includes('playSleighBell'), hasCall: src.includes('this.playSleighBell(') };
  });
  console.log('[sleighbell in dom]', JSON.stringify(bell));
  console.log('[errors]', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
