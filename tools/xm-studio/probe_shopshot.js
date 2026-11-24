/* 街边店铺背面窗户：截图看是否还闪（登录后第三人称冻结机位） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 160)));
  await pg.goto('https://preview.ai10088.com/alex-garage/', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.diorama && window.diorama.ray, { timeout: 120000 });
  await pg.waitForTimeout(4000);
  await pg.fill('#mp-acc', 'test08'); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => MP.toggleThird());
  await pg.waitForTimeout(1200);
  /* 背面：北段店铺背面 z=-31.9，窗在 x=-14.6±1.20 */
  await pg.evaluate(() => MP.freezeCam(-15.6, 1.9, -35.2, -15.6, 1.45, -31.9));
  await pg.waitForTimeout(1000);
  await pg.screenshot({ path: '/tmp/mp_shop_back.png' });
  /* 正面 */
  await pg.evaluate(() => MP.freezeCam(-16.2, 2.0, -26.2, -14.6, 1.6, -28.3));
  await pg.waitForTimeout(1000);
  await pg.screenshot({ path: '/tmp/mp_shop_front.png' });
  console.log('done');
  await b.close();
})();
