/* 顶视图 + 地标像素投影：把世界坐标标到截图上，确认留言亭该挪到哪 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  await pg.evaluate(() => { const el = document.getElementById('hour'); el.value = '13'; el.dispatchEvent(new Event('input')); });
  await pg.waitForTimeout(1200);

  const PTS = [
    ['carousel', 4, 30], ['guestbook', 4, 24.5], ['helipad', 52, 50.5],
    ['loopS0', 0, 15], ['loopS_w', -30, 15], ['loopS_e', 30, 15],
    ['wheel', 27, 36], ['ice', -20, 22], ['ship', 39.5, 36.5],
    ['candA', 4, 21.5], ['candB', -8, 21.5], ['candC', 16, 21.5],
    ['candD', -16, 26], ['candE', -16, 33], ['candF', 4, 40]
  ];
  const cams = [
    ['top', 4, 78, 30, 4, 0, 30],
    ['zoom', 4, 34, 30, 4, 0, 30]
  ];
  for (const [cname, px, py, pz, tx, ty, tz] of cams) {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), [px, py, pz, tx, ty, tz]);
    await pg.waitForTimeout(1300);
    await pg.screenshot({ path: `/tmp/g_${cname}.png` });
    const proj = await pg.evaluate(pts => window.diorama.camProject(pts.map(p => [p[1], 0, p[2]])), PTS);
    console.log('== cam', cname);
    PTS.forEach((p, i) => console.log('   ', p[0], '->', proj[i].join(',')));
  }
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
