/* 西区布局实测：关键地标的实际世界坐标与包围盒 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 120)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(12000);
  const info = await pg.evaluate(() => {
    const THREE = window.THREE;
    const out = [];
    const box = new THREE.Box3();
    const names = ['market', 'shopRow', 'fair', 'circus', 'amusement', 'street', 'west'];
    const seen = new Set();
    window.diorama.scene().traverse(o => {
      if (!o.isGroup && !o.isMesh) return;
      const tag = o.userData && o.userData.tag;
      if (!tag || seen.has(tag)) return;
      seen.add(tag);
      box.setFromObject(o);
      if (!isFinite(box.min.x)) return;
      out.push({
        tag,
        min: [box.min.x, box.min.y, box.min.z].map(v => +v.toFixed(1)),
        max: [box.max.x, box.max.y, box.max.z].map(v => +v.toFixed(1)),
      });
    });
    return out;
  });
  for (const r of info) console.log(r.tag.padEnd(10), 'x', r.min[0], '~', r.max[0], ' z', r.min[2], '~', r.max[2], ' y', r.min[1], '~', r.max[1]);
  await b.close();
})();
