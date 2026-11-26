/* 触摸事件通道嗅探：确认 CDP dispatchTouchEvent 到底有没有生成 pointer 事件 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => {
    window.__ev = [];
    ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove'].forEach(t =>
      document.addEventListener(t, e => window.__ev.push(t + ':' + (e.pointerType || '') + '@' + Math.round(e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0)) + ',' + Math.round(e.clientY || 0)), true));
  });
  console.log('hitTest:', JSON.stringify(await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 81, y: 757, id: 1 }] })));
  await pg.waitForTimeout(200);
  console.log('移动后事件:', JSON.stringify(await pg.evaluate(() => window.__ev.slice(0, 12))));
  console.log('hitTest:', JSON.stringify(await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 40, y: 757, id: 1 }] })));
  await pg.waitForTimeout(200);
  console.log('移动后事件:', JSON.stringify(await pg.evaluate(() => window.__ev.slice(0, 12))));
  console.log('joy:', JSON.stringify(await pg.evaluate(() => diorama.joy())));
  console.log('元素在 (81,757) 命中谁:', await pg.evaluate(() => {
    const el = document.elementFromPoint(81, 757);
    return el ? (el.id || el.tagName) : 'null';
  }));
  console.log('元素在 (40,757) 命中谁:', await pg.evaluate(() => {
    const el = document.elementFromPoint(40, 757);
    return el ? (el.id || el.tagName) : 'null';
  }));
  await b.close();
})();
