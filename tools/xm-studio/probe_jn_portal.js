/* 江南古村 · 传送门验收（本地或线上）
   用法：node probe_jn_portal.js [seed]   线上：JN_URL=... node probe_jn_portal.js */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const SEED = process.argv[2] || '4099461353';
const URL = process.env.JN_URL || `http://127.0.0.1:8900/?seed=${SEED}`;

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 250)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('[c] ' + String(m.text()).slice(0, 180)); });
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.__jnReady === true, null, { timeout: 180000 });
  await pg.waitForTimeout(900);

  const portals = await pg.evaluate(() => window.__jnPortals());
  console.log('传送门:', JSON.stringify(portals));

  /* 进沉浸模式，站到法阵上 */
  await pg.evaluate(() => window.__jnMode('walk'));
  await pg.waitForTimeout(900);
  const btnBefore = await pg.evaluate(() => document.getElementById('wb-portal').hidden);
  console.log('还没到法阵时按钮隐藏:', btnBefore);

  await pg.evaluate((p) => {
    const w = window.__jnWalk();
    if (w) { w.x = p.x + 1.0; w.z = p.z + 1.0; }
  }, portals[0]);
  await pg.waitForTimeout(700);
  const btn = await pg.evaluate(() => {
    const b = document.getElementById('wb-portal');
    return { hidden: b.hidden, text: b.textContent, visible: !!b.offsetParent };
  });
  console.log('到法阵后按钮:', JSON.stringify(btn));
  await pg.screenshot({ path: '/tmp/jn_portal_mobile.png' });

  /* 点按钮，应该跳到主站 */
  let jumped = '';
  try {
    await Promise.race([
      pg.waitForURL(/alex-garage/, { timeout: 15000 }),
      pg.click('#wb-portal', { timeout: 8000 })
    ]);
    await pg.waitForTimeout(2500);
    jumped = pg.url();
  } catch (e) {
    jumped = '未跳转: ' + String(e).slice(0, 120);
  }
  console.log('跳转结果:', jumped.slice(0, 160));
  console.log('报错:', errs.length); errs.slice(0, 5).forEach(e => console.log('  ', e));
  await b.close();
})();
