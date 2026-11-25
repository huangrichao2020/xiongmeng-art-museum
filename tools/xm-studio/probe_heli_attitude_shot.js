/* 直升机姿态目视核对：飞行中把相机挪到机身侧面（camOff=+1.4rad），
   在爬升段 / 巡航段 / 进近段各拍一张，看尾梁是翘还是沉。 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const HOUR=Number(process.env.HOUR||13);
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 660 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  await pg.evaluate(h => { const el=document.getElementById('hour'); el.value=String(h); el.dispatchEvent(new Event('input')); }, HOUR);
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => window.diorama.enterWalk());
  await pg.waitForTimeout(400);
  await pg.evaluate(() => window.diorama.heliWalkTo(52, 44));
  await pg.waitForTimeout(300);
  await pg.evaluate(() => window.diorama.heliRide());

  const want = [18, 34, 60, 120, 210, 262, 282, 292, 297, 299];
  const got = new Set();
  for (let i = 0; i < 700; i++) {
    const s = await pg.evaluate(() => {
      const h = window.diorama.heli();
      // 把视角绕到机身侧面：camOff 由 fp.yaw 与 camBase 的差决定
      const d = window.diorama;
      return { riding: h.riding, phase: h.phase, dist: h.dist, y: h.y, att: window.diorama.heliAtt(), tail: window.diorama.heliTail() };
    });
    for (const w of want) {
      if (!got.has(w) && s.dist >= w) {
        got.add(w);
        await pg.evaluate(() => { window.diorama.heliCamLook(true); window.diorama.sideView(1.45); });
        await pg.waitForTimeout(420);
        await pg.screenshot({ path: '/tmp/ha_d' + w + '.png' });
        console.log('d=' + w, s.phase, 'y=' + s.y, 'pitch=' + s.att.pitch, 'roll=' + s.att.roll, 'tail=' + s.tail[1]);
      }
    }
    if (!s.riding || got.size >= want.length) break;
    await pg.waitForTimeout(60);
  }
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
