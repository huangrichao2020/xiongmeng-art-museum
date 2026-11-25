/* ① 新内衬 A/B（这次开关是真的独立网格，能切）
   ② 直升机全程飞行：每 100ms 采样「整架最低点 + 尾梁高度 + 俯仰/侧倾」
      判据：最低点全程 ≥ 0（不能扎进地面），落地时姿态要平 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  const analyzer = await ctx.newPage();
  await analyzer.goto('about:blank');
  const lum = async (cam, box, tag) => {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1200);
    const buf = await pg.screenshot({ path: '/tmp/ln_' + tag + '.png' });
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

  /* ── ① 内衬 A/B ── */
  await pg.evaluate(() => { const el = document.getElementById('hour'); el.value = '21.5'; el.dispatchEvent(new Event('input')); });
  await pg.waitForTimeout(1600);
  const CAM = [50, 1.7, 33.5, 50, 6.4, 28.5];
  const BOX = [300, 40, 500, 300];   // 画面上半 = 顶棚（绕开中央旗杆）
  console.log('内衬开 天花板:', JSON.stringify(await lum(CAM, BOX, 'ceil_on')));
  await pg.evaluate(() => window.diorama.circusLining(false));
  console.log('内衬关 天花板:', JSON.stringify(await lum(CAM, BOX, 'ceil_off')));
  await pg.evaluate(() => window.diorama.circusLining(true));
  console.log('帐内全景:', JSON.stringify(await lum([50, 2.2, 35.5, 50, 1.4, 30], [300, 60, 500, 460], 'tent_in')));

  /* ── ② 直升机全程 ── */
  await pg.evaluate(() => window.MP.unfreezeCam());
  await pg.evaluate(() => window.diorama.enterWalk());
  await pg.waitForTimeout(400);
  await pg.evaluate(() => window.diorama.heliWalkTo(52, 44));
  await pg.waitForTimeout(400);
  await pg.evaluate(() => window.diorama.heliRide());
  const rows = [];
  let shots = 0;
  for (let i = 0; i < 400; i++) {
    const s = await pg.evaluate(() => ({
      h: window.diorama.heli(), t: window.diorama.heliTail(),
      m: window.diorama.heliMinY(), a: window.diorama.heliAtt()
    }));
    rows.push({ i, phase: s.h.phase, y: s.h.y, d: s.h.dist, minY: s.m && s.m.min,
      tail: s.t ? s.t[1] : null, pitch: s.a.pitch, roll: s.a.roll, part: s.m && s.m.part });
    if (s.h.phase === 'land' && shots < 2) { shots++; await pg.screenshot({ path: '/tmp/ln_land' + shots + '.png' }); }
    if (!s.h.riding && i > 5) break;
    await pg.waitForTimeout(100);
  }
  const minAll = Math.min(...rows.map(r => r.minY ?? 99));
  const minTail = Math.min(...rows.map(r => r.tail ?? 99));
  const maxPitch = Math.max(...rows.map(r => r.pitch));
  const minPitch = Math.min(...rows.map(r => r.pitch));
  const maxRoll = Math.max(...rows.map(r => Math.abs(r.roll)));
  console.log('采样', rows.length, ' 整架最低点 min =', minAll.toFixed(3), 'm  (穿模则 <0)');
  console.log('尾梁最低 =', minTail.toFixed(2), '  俯仰', minPitch.toFixed(3), '~', maxPitch.toFixed(3),
    '  侧倾 max', maxRoll.toFixed(3));
  console.log('--- 起飞段 ---');
  console.log(rows.slice(0, 26).map(r => `${r.phase} y=${r.y} minY=${r.minY} tail=${r.tail} p=${r.pitch} r=${r.roll}`).join('\n'));
  console.log('--- 最后 26 段（落地） ---');
  console.log(rows.slice(-26).map(r => `${r.phase} y=${r.y} d=${r.d} minY=${r.minY}(${r.part}) tail=${r.tail} p=${r.pitch} r=${r.roll}`).join('\n'));
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
