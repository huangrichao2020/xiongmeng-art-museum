const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE='https://preview.ai10088.com/alex-garage/';
const SHOT = process.argv[2] || 'coaster-chase';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.XM && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(2500);
  const rows = await p.evaluate(async (shot) => {
    window.XM.shot(shot);
    await new Promise(r => setTimeout(r, 2500));
    const out = [];
    await new Promise(res => {
      let n = 0;
      const tick = () => {
        const d = window.XM.debug();
        const key = shot.includes('fpv') ? d.facilities.fpv : d.facilities.coaster;
        if (key) {
          const c = d.cam.pos;
          const dx = key.pos[0]-c[0], dy = key.pos[1]-c[1], dz = key.pos[2]-c[2];
          out.push({
            cam: c, tgt: key.pos,
            dist: +Math.hypot(dx,dy,dz).toFixed(2),
            dx: +dx.toFixed(2), dy: +dy.toFixed(2), dz: +dz.toFixed(2),
            yaw: d.cam.yaw, pitch: d.cam.pitch, vis: key.visible
          });
        }
        if (++n >= 120) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return out;
  }, SHOT);

  if (!rows.length) { console.log('NO TARGET DATA for', SHOT); await b.close(); return; }
  const d = rows.map(r=>r.dist);
  console.log(SHOT, '样本', rows.length);
  console.log('  相机→主体距离  min %s  avg %s  max %s',
    Math.min(...d).toFixed(2), (d.reduce((a,c)=>a+c,0)/d.length).toFixed(2), Math.max(...d).toFixed(2));
  console.log('  相机 y 范围 %s ~ %s   主体 y 范围 %s ~ %s',
    Math.min(...rows.map(r=>r.cam[1])).toFixed(2), Math.max(...rows.map(r=>r.cam[1])).toFixed(2),
    Math.min(...rows.map(r=>r.tgt[1])).toFixed(2), Math.max(...rows.map(r=>r.tgt[1])).toFixed(2));
  console.log('  首样本', JSON.stringify(rows[0]), ' 末样本', JSON.stringify(rows[rows.length-1]));
  await b.close();
})();
