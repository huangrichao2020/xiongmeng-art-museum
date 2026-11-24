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
  await p.waitForFunction(() => window.XM && window.XM.version && window.XM.debug, { timeout:90000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(async (shot) => {
    window.XM.shot(shot);
    await new Promise(r => setTimeout(r, 2500));   // 等机位稳定
    const frames = [];
    await new Promise(res => {
      let n = 0;
      const tick = () => {
        frames.push(window.XM.debug());
        if (++n >= 200) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return frames;
  }, SHOT);

  // 分析：roll 摆动 / 位置二阶差分(jerk) / 帧间隔抖动
  const rolls = r.map(f => f.cam.roll);
  const pos = r.map(f => f.cam.pos);
  const dts = [];
  for (let i = 1; i < r.length; i++) {
    const a = pos[i-1], c = pos[i];
    dts.push(Math.hypot(c[0]-a[0], c[1]-a[1], c[2]-a[2]));
  }
  const jerk = [];
  for (let i = 1; i < dts.length; i++) jerk.push(Math.abs(dts[i] - dts[i-1]));
  const avg = a => a.reduce((x,y)=>x+y,0)/(a.length||1);
  const max = a => Math.max(...a);
  const min = a => Math.min(...a);
  console.log(JSON.stringify({
    shot: SHOT,
    frames: r.length,
    roll: { min:+min(rolls).toFixed(3), max:+max(rolls).toFixed(3), range:+(max(rolls)-min(rolls)).toFixed(3) },
    pitchRange: +(Math.max(...r.map(f=>f.cam.pitch)) - Math.min(...r.map(f=>f.cam.pitch))).toFixed(2),
    yawRange: +(Math.max(...r.map(f=>f.cam.yaw)) - Math.min(...r.map(f=>f.cam.yaw))).toFixed(2),
    perFrameMove: { avg:+avg(dts).toFixed(4), max:+max(dts).toFixed(4) },
    jerk: { avg:+avg(jerk).toFixed(4), max:+max(jerk).toFixed(4) },
    fps: r[r.length-1].fps, draws: r[r.length-1].draw, dpr: r[r.length-1].dpr
  }, null, 2));
  await b.close();
})();
