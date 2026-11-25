/* 量一下坐摩天轮时吊篮与相机的真实轨迹
   —— 之前是靠猜「轮子往哪转、吊篮往哪升」，结果录出来 13 秒时相机已经掉到地面、
      轮圈弧线横贯画面。这里直接打点看真数据。

   用法： node probe_wheel_path.js [--mode ascend|top|low]
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');

const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MODE = getArg('--mode', 'top');

(async () => {
  const b = await chromium.launch({
    executablePath: EXE, headless: true,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu',
      '--autoplay-policy=no-user-gesture-required']
  });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(14000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay', 'boot']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    if (window.__fp) window.__fp.on = false;
    if (window.MP && window.MP.exitWalk) window.MP.exitWalk();
    window.XM_TOUR.stopDirector();
  });
  await pg.waitForTimeout(2000);

  /* 列出所有吊篮的起始角度与高度 */
  const cabs = await pg.evaluate(() => {
    const T = window.XM_TOUR, THREE = T.THREE;
    const wp = new THREE.Vector3();
    return T.amusement.cabs.map((c, i) => {
      c.getWorldPosition(wp);
      const dx = wp.x - 27, dy = wp.y - 16.6;
      return {
        i, x: +wp.x.toFixed(2), y: +wp.y.toFixed(2), z: +wp.z.toFixed(2),
        deg: +(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1),
        rad: +Math.hypot(dx, dy).toFixed(2)
      };
    });
  });
  console.log('轮心 (27, 16.6, 36)，吊篮初始位置：');
  cabs.forEach(c => console.log(`  #${String(c.i).padStart(2)} 角度 ${String(c.deg).padStart(7)}°  位置(${c.x}, ${c.y}, ${c.z})`));

  /* 骑上去，每 0.5s 打一次点 */
  await pg.evaluate((mode) => {
    const T = window.XM_TOUR;
    if (mode === 'top') T.rideWheel('top');
    else if (mode === 'ascend') T.rideWheel('ascend');
    else T.rideWheel('low');
    window.__LOG = [];
    const t0 = performance.now();
    const iv = setInterval(() => {
      const el = (performance.now() - t0) / 1000;
      const cab = T.wheelSys.cab;
      if (!cab) return;
      const wp = new T.THREE.Vector3();
      cab.getWorldPosition(wp);
      const cam = T.camera.position;
      window.__LOG.push({
        t: +el.toFixed(1),
        cab: [+wp.x.toFixed(1), +wp.y.toFixed(1), +wp.z.toFixed(1)],
        cam: [+cam.x.toFixed(1), +cam.y.toFixed(1), +cam.z.toFixed(1)],
        wheelZ: +T.amusement.wheel.rotation.z.toFixed(3)
      });
      if (el > 16) clearInterval(iv);
    }, 500);
  }, MODE);

  await pg.waitForTimeout(18000);
  const log = await pg.evaluate(() => window.__LOG);
  console.log('\n=== 骑乘轨迹（每 0.5s）===');
  console.log('  t     吊篮位置            相机位置            轮角');
  log.forEach(l => console.log(`  ${String(l.t).padStart(4)}  ${JSON.stringify(l.cab).padEnd(20)} ${JSON.stringify(l.cam).padEnd(20)} ${l.wheelZ}`));

  await b.close();
})();
