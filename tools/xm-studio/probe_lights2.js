/* 灯光清单：类型/强度/衰减/位置，找可以合并或降级的 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(4000);
  const out = await pg.evaluate(() => {
    const scene = window.diorama.scene();
    const L = [];
    scene.traverse(o => {
      if (!o.isLight) return;
      const p = o.getWorldPosition(new (o.position.constructor)());
      L.push({
        type: o.type, name: o.name || '', tag: o.userData && o.userData.tag || '',
        int: +o.intensity.toFixed(2), dist: o.distance || 0, dec: o.decay || 0,
        shadow: !!o.castShadow, visible: o.visible,
        pos: [Math.round(p.x), Math.round(p.y), Math.round(p.z)],
      });
    });
    return L;
  });
  const byType = {};
  out.forEach(l => { byType[l.type] = (byType[l.type] || 0) + 1; });
  console.log('total lights =', out.length, JSON.stringify(byType));
  out.forEach(l => console.log(l.type.padEnd(16), 'i=' + String(l.int).padEnd(6), 'd=' + String(l.dist).padEnd(6),
    'dec=' + String(l.dec).padEnd(5), l.shadow ? 'SHADOW' : '      ', 'pos=' + JSON.stringify(l.pos).padEnd(18), l.tag));
  await b.close();
})();
