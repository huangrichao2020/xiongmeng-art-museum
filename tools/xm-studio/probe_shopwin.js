/* 街边店铺背面窗户闪烁取证：射线打背面窗户，看有没有两个命中距离几乎相同（共面） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 160)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.diorama && window.diorama.ray, { timeout: 120000 });
  await pg.waitForTimeout(4000);

  const r = await pg.evaluate(() => {
    const out = {};
    /* 北段店铺 {x:-14.6,z:-30.1,rot:0} → 背面在 z = -31.9，背窗 x = -14.6±1.20 */
    const shopX = -14.6, backZ = -31.9;
    /* 背面窗户中心：局部 x=±1.20，窗底 y=1.05，窗高 .86 → 中心 y=1.48 */
    out.backWindow = window.diorama.ray(shopX - 1.20, 1.48, backZ - 6, shopX - 1.20, 1.48, backZ);
    /* 正面窗户中心：局部 x=±1.50，窗底 y=.92，窗高 .96 → 中心 y=1.40，正面 z=-28.3 */
    out.frontWindow = window.diorama.ray(shopX - 1.50, 1.40, -28.3 + 6, shopX - 1.50, 1.40, -28.3);
    /* 西段店铺 {x:-63.1,z:-9.5,rot:PI/2} → 侧面 x = -63.1-2.2 = -65.3，侧窗 z=-9.5±.6 */
    out.sideWindow = window.diorama.ray(-65.3 - 6, 1.70, -9.5 - 0.6, -65.3, 1.70, -9.5 - 0.6);
    return out;
  });
  for (const k of Object.keys(r)) {
    const hits = r[k];
    let verdict = '✓ 无共面';
    if (hits.length >= 2) {
      const d = Math.abs(hits[0].d - hits[1].d);
      verdict = d < 0.02 ? `✗ 共面！两个命中差 ${(d * 100).toFixed(1)}cm → 会闪` : `✓ 两命中差 ${(d * 100).toFixed(1)}cm`;
    }
    console.log(`[${k}] ${verdict}`);
    console.log('   ', JSON.stringify(hits));
  }

  /* 从背面拍一张，看有没有花屏（z-fighting 的噪点） */
  await pg.evaluate(() => {
    MP.freezeCam(-15.8, 2.2, -36.5, -15.8, 1.5, -31.6);
  });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: '/tmp/mp_shop_back.png' });
  await b.close();
})();
