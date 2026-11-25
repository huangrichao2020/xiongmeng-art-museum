/* 「傍晚白膜」差分探针：同一机位下逐层关掉 sprite / 加色层，用像素差定位白膜来源 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
const CAMS = {
  plaza: [22, 18, 26, 0, 4, -6],
  west: [-46, 12, 14, -40, 4, -2],
  market: [-30, 10, 6, -22, 3, -12],
};
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  const cam = process.env.CAM || 'plaza';
  const hour = process.env.HOUR || '17.5';
  const c = CAMS[cam];
  const setup = ({ c, hour }) => {
    window.diorama.setRain(0);
    const el = document.getElementById('hour'); el.value = String(hour); el.dispatchEvent(new Event('input'));
    window.MP.freezeCam(c[0], c[1], c[2], c[3], c[4], c[5]);
  };
  await pg.evaluate(setup, { c, hour });
  await pg.waitForTimeout(1500);
  const tag = process.env.TAG || 'w';
  await pg.screenshot({ path: `/tmp/${tag}_base.png` });

  const sprites = await pg.evaluate(() => {
    const out = [];
    window.diorama.scene().traverse(o => {
      if (o.isSprite) {
        const p = o.getWorldPosition(new (o.position.constructor)());
        out.push({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), sx: +o.scale.x.toFixed(1), sy: +o.scale.y.toFixed(1), op: +o.material.opacity.toFixed(3), col: '#' + o.material.color.getHexString() });
      }
    });
    return out;
  });
  console.log('SPRITES ' + JSON.stringify(sprites));

  const hide = (expr) => pg.evaluate((expr) => {
    const f = eval(expr);
    const n = [];
    window.diorama.scene().traverse(o => {
      if (o.__ox === undefined) o.__ox = o.position.x;
      if (f(o)) { o.position.x = 99999; n.push({ t: o.type, sx: +(o.scale.x || 0).toFixed(1), x: +o.__ox.toFixed(1) }); }
    });
    return n;
  }, expr);
  const restore = () => pg.evaluate(() => {
    window.diorama.scene().traverse(o => { if (o.__ox !== undefined) o.position.x = o.__ox; });
  });

  console.log('HID_ALL_SPRITE ' + JSON.stringify(await hide('o=>o.isSprite')));
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: `/tmp/${tag}_nosprite.png` });
  await restore();
  await pg.waitForTimeout(600);

  console.log('HID_BIG_SPRITE ' + JSON.stringify(await hide('o=>o.isSprite&&o.scale.x>8')));
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: `/tmp/${tag}_nobig.png` });
  await restore();
  await pg.waitForTimeout(600);

  console.log('HID_ADD_MESH ' + JSON.stringify(await hide('o=>o.isMesh&&o.material&&o.material.blending===2')));
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: `/tmp/${tag}_noadd.png` });
  await restore();
  await pg.waitForTimeout(600);

  await b.close();
})();
