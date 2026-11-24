/* 热气球探针：①迪士尼配色/印刷图案截图 ②火焰最低点在满油门时会不会掉到燃烧器下面 ③伞体灰阶 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const TAG = process.argv[3] || 'x';
const BX = -49.0, BZ = 51.0;
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(8000);
  await p.evaluate(() => window.XM.shot('balloon-ground'));
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `/tmp/bal_${TAG}.png` });
  // 火焰：把 burn 拉满 + 给一个上升速度，看火焰底会不会掉到燃烧器下面
  const flame = await p.evaluate(() => {
    const P = window.__PROBE, T = window.__THREE;
    const b = P.balloons[0];
    b.burn = 1.05; b.vy = 3.4;
    b.g.rotation.z = -b.vy * .035;
    b.g.updateMatrixWorld(true);
    const bb = new T.Box3().setFromObject(b.flame);
    const bbIn = new T.Box3().setFromObject(b.flameIn);
    const burnerY = b.g.position.y + 3.08;       // 燃烧器口（局部 y）
    return {
      flameMinY: bb.min.y, flameMaxY: bb.max.y,
      innerMinY: bbIn.min.y,
      burnerY, drop: burnerY - bb.min.y,
      flameH: bb.max.y - bb.min.y
    };
  });
  console.log(TAG, '火焰:', JSON.stringify(flame));
  // 伞体取样点
  const pts = await p.evaluate((cfg) => {
    const P = window.__PROBE, V = window.__THREE.Vector3;
    const cam = P.camera; cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const w = innerWidth, h = innerHeight;
    const proj = (x,y,z) => { const v = new V(x,y,z).project(cam);
      return [Math.round((v.x*.5+.5)*w), Math.round((-v.y*.5+.5)*h)]; };
    return {
      envTop: proj(cfg.BX, 17, cfg.BZ),
      envMid: proj(cfg.BX, 12, cfg.BZ),
      flame: proj(cfg.BX, 3.4, cfg.BZ),
      sky:   proj(cfg.BX, 30, cfg.BZ)
    };
  }, { BX, BZ });
  console.log(TAG, '投影点:', JSON.stringify(pts));
  console.log(TAG, '完成');
  await b.close();
})();
