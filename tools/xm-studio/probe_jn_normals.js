/* 江南民居屋顶法线分布诊断 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
  const pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8900/?seed=4099461353', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.__jnReady, null, { timeout: 120000 });
  await pg.waitForTimeout(1200);
  const r = await pg.evaluate(() => {
    const T = window.__jnWorld;
    const tile = T.getObjectByName('houses-tile');
    const pos = tile.geometry.attributes.position, nor = tile.geometry.attributes.normal;
    let roofDown = 0, roofUp = 0, lowDown = 0;
    const samples = [];
    for (let i = 0; i < nor.count; i++) {
      const ny = nor.getY(i), py = pos.getY(i);
      if (ny < -0.05) {
        if (py > 2.0) { roofDown++; if (samples.length < 5) samples.push([+pos.getX(i).toFixed(2), +py.toFixed(2), +pos.getZ(i).toFixed(2)]); }
        else lowDown++;
      } else if (ny > 0.05) roofUp++;
    }
    return { roofDown, roofUp, lowDown, samples };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
