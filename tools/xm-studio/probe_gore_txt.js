const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.__PROBE && window.__PROBE.balloons, { timeout:120000 });
  await p.waitForTimeout(7000);
  const info = await p.evaluate(() => {
    const P = window.__PROBE;
    const bb = P.balloons[0];
    const out = [];
    bb.g.traverse(o => {
      if (o.isMesh && o.material.map && o.material.emissiveMap) {
        const img = o.material.map.image;
        // 只导出印字那片：用颜色判断（品红底 + 白字）
        out.push({ w: img.width, h: img.height, data: img.toDataURL('image/png') });
      }
    });
    return out;
  });
  info.forEach((o, i) => { fs.writeFileSync(`/tmp/gt_${i}.png`, Buffer.from(o.data.split(',')[1], 'base64')); });
  console.log('导出', info.length, '片瓜瓣贴图');
  await b.close();
})();
