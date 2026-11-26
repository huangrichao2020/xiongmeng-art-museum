/* 环路整改对比截图（2026-11-26）
   拍 5 个机位：全场俯视 / 北段马路俯视 / 北段马路平视 / 西段外侧步道 / 南段正门

   用法： node probe_road_shot.js [前缀]
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const PRE = process.argv[2] || 'road';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  const shot = async (name, cam) => {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1500);
    await pg.screenshot({ path: `/tmp/${PRE}_${name}.png` });
    console.log('shot', name);
  };
  await shot('all', [0, 185, 66, 0, 0, 0]);            // 全场俯视
  await shot('north', [0, 46, -20, 0, 0, -21]);        // 北段马路俯视（用户箭头那一处）
  await shot('north_eye', [12, 3.4, -14, -6, 2.2, -22]); // 北段马路平视
  await shot('west', [-52, 30, -3, -60, 0, -3]);      // 西段外侧步道
  await shot('south', [0, 40, 8, 0, 0, 15]);          // 南段马路俯视
  await shot('east', [52, 3.2, -2, 62, 2.2, -4]);     // 东段外侧步道平视
  await shot('market', [-26, 16, 2, -36, 1.2, 4]);    // 市集西列平视
  await shot('sw', [-52, 22, 8, -49, 0, 13]);        // 西南角：教堂红毯广场 vs 环路
  await shot('se', [62, 20, 8, 56, 0, 9]);           // 东南角：人行道终点 vs 游乐园
  await b.close();
})();
