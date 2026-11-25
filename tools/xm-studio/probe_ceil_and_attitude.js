/* ① 帐篷天花板亮度 A/B（有内衬 / 无内衬）
   ② 直升机全程飞行：采样尾梁末端世界高度 + 俯仰角，看有没有扎地 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 220)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  const analyzer = await ctx.newPage();
  await analyzer.goto('about:blank');
  const lum = async (cam, box) => {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1300);
    const buf = await pg.screenshot({ path: '/tmp/ce_' + lum.tag + '.png' });
    return await analyzer.evaluate(async ({ d, box }) => {
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = 'data:image/png;base64,' + d; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const px = x.getImageData(box[0], box[1], box[2], box[3]).data;
      let sum = 0, n = 0, mx = 0, over = 0;
      for (let i = 0; i < px.length; i += 4) {
        const l = .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2];
        sum += l; n++; if (l > mx) mx = l; if (l > 245) over++;
      }
      return { avg: +(sum / n).toFixed(1), max: +mx.toFixed(0), over245: +(over / n * 100).toFixed(2) };
    }, { d: buf.toString('base64'), box });
  };

  /* ── ① 天花板 ── */
  await pg.evaluate(() => { const el = document.getElementById('hour'); el.value = '21.5'; el.dispatchEvent(new Event('input')); });
  await pg.waitForTimeout(1500);
  const CAM_CEIL = [50, 1.7, 33.5, 50, 6.4, 28.5];   // 帐内往上看天花板
  const BOX_CEIL = [330, 40, 440, 260];               // 画面上半 = 顶棚
  lum.tag = 'ceil_on';
  await pg.evaluate(() => window.diorama.circusLining(true));
  console.log('有内衬 天花板:', JSON.stringify(await lum(CAM_CEIL, BOX_CEIL)));
  lum.tag = 'ceil_off';
  await pg.evaluate(() => window.diorama.circusLining(false));
  console.log('无内衬 天花板:', JSON.stringify(await lum(CAM_CEIL, BOX_CEIL)));
  await pg.evaluate(() => window.diorama.circusLining(true));
  // 顺带看一眼帐内整体
  lum.tag = 'tent_in';
  console.log('帐内全景:', JSON.stringify(await lum([50, 2.2, 35.5, 50, 1.4, 30], [330, 60, 440, 420])));

  /* ── ② 直升机全程采样 ── */
  await pg.evaluate(() => window.MP.unfreezeCam());
  await pg.evaluate(() => window.diorama.enterWalk());
  await pg.waitForTimeout(500);
  await pg.evaluate(() => window.diorama.heliWalkTo(52, 44));
  await pg.waitForTimeout(400);
  await pg.evaluate(() => window.diorama.heliRide());
  let minTail = 99, minTailAt = '', maxPitch = -9, minPitch = 9, minHeliy = 99, samples = 0;
  for (let i = 0; i < 170; i++) {
    const s = await pg.evaluate(() => ({
      h: window.diorama.heli(), t: window.diorama.heliTail(), n: window.diorama.heliNose(),
      a: window.diorama.heliAtt()
    }));
    if (s.t) {
      if (s.t[1] < minTail) { minTail = s.t[1]; minTailAt = `phase=${s.h.phase} y=${s.h.y} pitch=${s.a.pitch}`; }
      if (s.a.pitch > maxPitch) maxPitch = s.a.pitch;
      if (s.a.pitch < minPitch) minPitch = s.a.pitch;
      if (s.h.y < minHeliy) minHeliy = s.h.y;
      samples++;
    }
    if (!s.h.riding && i > 5) break;
    await pg.waitForTimeout(180);
  }
  console.log('采样数:', samples, ' 尾梁最低世界高度:', minTail, 'm  @', minTailAt);
  console.log('俯仰范围: min', minPitch, 'max', maxPitch, 'rad  (限幅 ±0.20)');
  console.log('机体最低离地:', minHeliy, 'm');
  console.log('最终:', JSON.stringify(await pg.evaluate(() => window.diorama.heli())));
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
