/* 博物馆夜景立面 + 广场照明对比 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const TAG = process.argv[2] || 'x';
const VIEWS = [
  ['facade', [0, 2.4, 26, 0, 7, 6]],
  ['gate', [-14, 2.2, 14, -2, 4, 6]],
  ['inside', [1.5, 1.7, 4.0, 1.0, 1.6, -6]]
];
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const pg = await (await b.newContext({ viewport:{width:1000,height:600} })).newPage();
  pg.on('pageerror', e=>console.log('[err]',String(e).slice(0,160)));
  await pg.goto('http://127.0.0.1:8899/?ui'+(process.env.EXTRA_URL||''), { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.XM_TOUR, null, {timeout:180000});
  await pg.evaluate(()=>{document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e=>e.style.display='none'); if(window.__fp)window.__fp.on=false; window.XM_TOUR.stopDirector();});
  await pg.waitForTimeout(9000);
  for(const [n,cam] of VIEWS){
    await pg.evaluate(a=>window.MP.freezeCam(a[0],a[1],a[2],a[3],a[4],a[5]), cam);
    await pg.waitForTimeout(1500);
    const cp = await pg.evaluate(()=>{const c=window.XM_TOUR.camera;return {p:[c.position.x,c.position.y,c.position.z].map(v=>+v.toFixed(2)),q:[c.quaternion.x,c.quaternion.y,c.quaternion.z,c.quaternion.w].map(v=>+v.toFixed(3))};});
    await pg.screenshot({ path:`/tmp/${TAG}_${n}.png` });
    console.log('shot', n, 'cam', cp.p.join(','), 'q', cp.q.join(','));
  }
  await b.close();
})();
