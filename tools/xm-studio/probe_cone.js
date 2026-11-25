// 找出场景里所有大锥体（黑锥元凶）
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e.stack || e).slice(0, 500)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForTimeout(30000);
  const out = await pg.evaluate(() => {
    const res = [];
    const scene = window.diorama && window.diorama.scene ? window.diorama.scene() : null;
    if (!scene) return { err: 'no scene' };
    scene.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      const isCone = g.type === 'ConeGeometry' || (g.parameters && g.parameters.radiusTop !== undefined);
      if (!isCone) return;
      const p = g.parameters || {};
      const h = (p.height || 0) * Math.abs(o.scale.y);
      const r = (p.radius || 0) * Math.max(Math.abs(o.scale.x), Math.abs(o.scale.z));
      if (h < 1.4 || r < 0.25) return;
      const e = o.matrixWorld.elements;
      const col = o.material && o.material.color ? o.material.color.getHexString() : '?';
      let chain = [], q = o;
      while (q && chain.length < 6) { if (q.name) chain.push(q.name); q = q.parent; }
      res.push({ g: g.type, h: +h.toFixed(2), r: +r.toFixed(2),
        x: +e[12].toFixed(2), y: +e[13].toFixed(2), z: +e[14].toFixed(2),
        col, chain: chain.join('<'),
        parentTag: (() => { let q = o; while (q) { if (q.userData && q.userData.tag) return q.userData.tag; q = q.parent; } return ''; })() });
    });
    return { n: res.length, res };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
