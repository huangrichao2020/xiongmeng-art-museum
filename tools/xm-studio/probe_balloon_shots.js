const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const TAG = process.argv[3] || 'x';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:1})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(8000);
  for (const shot of ['balloon-ground','balloon-above','balloon-chase']) {
    await p.evaluate((s) => window.XM.shot(s), shot);
    await p.waitForTimeout(4500);
    await p.screenshot({ path: `/tmp/bs_${TAG}_${shot}.png` });
    console.log('saved', shot);
  }
  // 火焰：满油门 + 上升速度下，火焰底会不会掉到燃烧器下面
  const flame = await p.evaluate(() => {
    const P = window.__PROBE, T = window.__THREE;
    const b = P.balloons[0];
    b.burn = 1.05; b.vy = 3.4;
    const fl = .55 + b.burn*.85;
    b.flame.scale.set(.80+b.burn*.50, fl, .80+b.burn*.50);
    b.flameIn.scale.set(.70+b.burn*.40, fl*.82, .70+b.burn*.40);
    b.g.rotation.z = -b.vy*.035;
    b.g.updateMatrixWorld(true);
    const bb = new T.Box3().setFromObject(b.flame);
    const bi = new T.Box3().setFromObject(b.flameIn);
    const burnerY = b.g.position.y + 3.08;
    return { flameBottom: +bb.min.y.toFixed(3), innerBottom: +bi.min.y.toFixed(3),
             burnerY: +burnerY.toFixed(3), dropBelowBurner: +(burnerY - bb.min.y).toFixed(3),
             flameTop: +bb.max.y.toFixed(3), flameH: +(bb.max.y-bb.min.y).toFixed(3) };
  });
  console.log(TAG, '满油门火焰:', JSON.stringify(flame));
  await b.close();
})();
