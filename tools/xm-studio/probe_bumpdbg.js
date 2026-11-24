/* 碰碰车碰撞专项：定位玩家车位置是否被还原 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 200)));
  await pg.goto('https://preview.ai10088.com/alex-garage/', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(4000);
  await pg.fill('#mp-acc', 'test06'); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(3000);

  const r = await pg.evaluate(async () => {
    const out = {};
    const list = window.diorama.bumpers();
    const car = window.diorama.ride('bumper');
    out.rideOk = !!car;
    out.driven = car ? !!car.userData.st.driven : null;
    await new Promise(r => setTimeout(r, 400));
    const other = list.find(c => c !== car);
    out.before = [+car.position.x.toFixed(2), +car.position.z.toFixed(2)];
    out.otherBefore = [+other.position.x.toFixed(2), +other.position.z.toFixed(2)];
    car.position.set(other.position.x, .12, other.position.z + 1.2);
    out.afterSet = [+car.position.x.toFixed(2), +car.position.z.toFixed(2)];
    out.d0 = +Math.hypot(car.position.x - other.position.x, car.position.z - other.position.z).toFixed(2);
    await new Promise(r => setTimeout(r, 300));
    out.d300 = +Math.hypot(car.position.x - other.position.x, car.position.z - other.position.z).toFixed(2);
    out.pos300 = [+car.position.x.toFixed(2), +car.position.z.toFixed(2)];
    out.ang = +window.MP.debug && 0;
    window.__B = { car, other };
    return out;
  });
  console.log('[定位]', JSON.stringify(r));
  await b.close();
})();
