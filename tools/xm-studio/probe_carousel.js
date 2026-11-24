/* 旋转木马到底转不转 + 马匹/骑手是否还在 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 140)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(7000);
  const snap = () => pg.evaluate(() => {
    const c = window.__amusement ? window.__amusement.carousel : null;
    return null;
  });
  /* 从 window 上找：amusement 是模块内 const，用 scene 找 */
  const info = await pg.evaluate(() => {
    const out = { found: [], carousel: null };
    window.__scene = window.__scene || null;
    return out;
  });
  /* 直接遍历 scene：找 userData.physObj.kind==='carousel' */
  const find = () => pg.evaluate(() => {
    const res = [];
    const sc = window.__SCENE__ || (window.scene && window.scene) || null;
    return sc;
  });
  console.log('probe start');
  await b.close();
})();
