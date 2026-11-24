/* 店铺三件套近景取证：马路店铺 / 集市摊位 / 游乐园小吃摊
   用法: node probe_shops.js <site> <tag> */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const TAG = process.argv[3] || 'x';

const VIEWS = [
  // [名字, 相机位置, 注视点, fov]
  ['shop_north',  [-4.0, 2.1, -23.6], [-4.0, 2.2, -30.1], 52],   // 北街小店正面
  ['shop_west',   [-56.0, 2.1, -2.0], [-63.1, 2.2, -2.0], 52],   // 西段小店（沿路看）
  ['market_west', [-31.0, 2.0, 4.6],  [-35.5, 2.0, 4.6], 50],    // 市集西列摊位正面
  ['market_north',[-27.0, 2.0, -7.6], [-27.0, 2.0, -12.4], 50],   // 市集北排摊位正面
  ['fair_stall',  [25.0, 2.2, 27.6],  [25.0, 2.1, 22.0], 50],    // 游乐园小吃摊正面
  ['fair_gate',   [4.0, 2.0, 28.6],   [4.0, 2.2, 24.5], 48],     // 游乐园留言亭
  ['church_ref',  [-49.0, 3.0, 14.0], [-49.0, 4.2, 26.0], 54],  // 教堂参照（标杆）
  ['market_top',  [-30.0, 6.2, 9.0],  [-35.5, 1.6, 4.0], 52],    // 市集摊位俯视（看屋面）
  ['shop_top',    [-3.4, 6.6, -24.0], [-3.4, 2.0, -30.1], 52],   // 街边小店俯视（看屋面）
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1280,height:800}, deviceScaleFactor:1})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(9000);
  // 进园区场景
  await p.evaluate(() => window.XM.shot('market-lane'));
  await p.waitForTimeout(2500);

  for (const [name, pos, look, fov] of VIEWS) {
    await p.evaluate(([pos, look, fov]) => {
      const P = window.__PROBE, T = window.__THREE;
      const cam = P.camera;
      window.__camPos = pos; window.__camLook = look;
      if (!cam.__patched) {
        cam.__patched = true;
        const tmp = new T.Vector3();
        const origCopy = cam.position.copy.bind(cam.position);
        const origLook = cam.lookAt.bind(cam);
        cam.position.copy = (v) => { const c = window.__camPos; return origCopy(tmp.set(c[0], c[1], c[2])); };
        cam.lookAt = (x, y, z) => { const c = window.__camLook; return origLook(c[0], c[1], c[2]); };
      }
      cam.fov = fov; cam.updateProjectionMatrix();
    }, [pos, look, fov]);
    await p.waitForTimeout(1600);
    await p.screenshot({ path: `/tmp/shop_${name}_${TAG}.png` });
    console.log('saved', name);
  }
  const calls = await p.evaluate(() => window.__PROBE.renderer.info.render.calls);
  console.log(TAG, 'draw calls =', calls);
  await b.close();
})();
