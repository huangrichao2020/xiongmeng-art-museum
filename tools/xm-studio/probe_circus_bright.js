/* 马戏团帐篷内亮度实测（相机放到缩小的帐篷里面）：
   量表演区与观众区的平均亮度 / 峰值 / 过曝像素占比 */
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
  await pg.evaluate(() => { const el = document.getElementById('hour'); el.value = '21.5'; el.dispatchEvent(new Event('input')); });
  await pg.waitForTimeout(1500);

  await pg.evaluate(() => {
    window.__L = [];
    window.diorama.scene().traverse(o => {
      if (o.isPointLight && o.userData && o.userData.lpFixed) {
        const p = o.getWorldPosition(new (window.diorama.scene().position.constructor)());
        if (Math.hypot(p.x - 50, p.z - 30) < 12) window.__L.push(o);
      }
    });
  });
  const lamps = await pg.evaluate(() => window.__L.map(l => +l.intensity.toFixed(1)));
  console.log('帐篷固定灯当前强度:', JSON.stringify(lamps));

  const analyzer = await ctx.newPage();
  await analyzer.goto('about:blank');
  const lum = async (cam, box, name) => {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1300);
    const buf = await pg.screenshot({ path: '/tmp/ct_' + name + '.png' });
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
  const setOn = m => pg.evaluate(k => { window.__L.forEach((l, i) => { l.visible = !!(k & (1 << i)); }); }, m);

  // 帐篷现在半径 6.94，机位必须放在帐内（距中心 < 5m）
  const CAM_STAGE = [50, 4.0, 25.6, 50, 1.6, 30.2];
  const CAM_AUD = [50, 3.4, 33.6, 50, 1.2, 28.5];
  const BOX = [330, 300, 440, 330];
  await setOn(0b111);
  console.log('3盏全开 表演区:', JSON.stringify(await lum(CAM_STAGE, BOX, 'stage3')));
  console.log('3盏全开 观众区:', JSON.stringify(await lum(CAM_AUD, BOX, 'aud3')));
  await setOn(0);
  console.log('全关对照 表演区:', JSON.stringify(await lum(CAM_STAGE, BOX, 'stage0')));
  console.log('全关对照 观众区:', JSON.stringify(await lum(CAM_AUD, BOX, 'aud0')));
  await setOn(0b111);
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
