/* 从外面看帐篷顶（A/B：自发光强度调低前/后）
   同时量一下帐内天花板，确认两边都处理了 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  const analyzer = await ctx.newPage();
  await analyzer.goto('about:blank');
  const meas = async (cam, box, tag) => {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1300);
    const buf = await pg.screenshot({ path: '/tmp/tt_' + tag + '.png' });
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
  const setHour = async h => { await pg.evaluate(v => { const el = document.getElementById('hour'); el.value = String(v); el.dispatchEvent(new Event('input')); }, h); await pg.waitForTimeout(1800); };

  await setHour(21.5);
  const CAM_OUT = [50, 9, 48, 50, 4, 30];
  const BOX_OUT = [270, 250, 460, 190];   // 帐篷顶
  console.log('外顶(现状)      :', JSON.stringify(await meas(CAM_OUT, BOX_OUT, 'out_now')));
  /* 把红白帆布的自发光压到一半再测 */
  const setEmi = async k => pg.evaluate(kk => {
    const sc = window.diorama.scene(); let n = 0;
    sc.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.emissive) return;
      const h = o.material.color.getHexString();
      if (h === 'be3a2c' || h === 'eee0c2') { o.material.emissiveIntensity = kk; n++; }
    });
    return n;
  }, k);
  console.log('改到自发光网格数:', await setEmi(0.20));
  console.log('外顶(自发光 .20):', JSON.stringify(await meas(CAM_OUT, BOX_OUT, 'out_e20')));
  await setEmi(0.12);
  console.log('外顶(自发光 .12):', JSON.stringify(await meas(CAM_OUT, BOX_OUT, 'out_e12')));
  await setEmi(0.42);
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
