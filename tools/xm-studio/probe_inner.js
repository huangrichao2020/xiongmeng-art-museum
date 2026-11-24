/* 找出 shop / fair 内部「会动」的子组 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.XM.shot('balloon-above'));
  await p.waitForTimeout(2000);
  const r = await p.evaluate(async () => {
    const scene = window.__PROBE.scene;
    const V = window.__THREE.Vector3;
    const snap = () => {
      const arr = [];
      scene.traverse(o => { if (o.isMesh) arr.push([o.id, o.matrixWorld.elements.join(',')]); });
      return arr;
    };
    const a = snap(); await new Promise(r => setTimeout(r, 1500)); const b2 = snap();
    const mapA = new Map(a); const moved = new Set();
    for (const [id, m] of b2) if (mapA.get(id) !== m) moved.add(id);
    const report = (root, label) => {
      const rows = root.children.map((c, i) => {
        let mesh = 0, mv = 0; const samp = [];
        c.traverse(o => { if (o.isMesh) { mesh++; if (moved.has(o.id)) mv++; if (samp.length < 2) samp.push(o.geometry.type); } });
        const v = new V(); c.getWorldPosition(v);
        return { i, type: c.type, mesh, mv, pos: [v.x.toFixed(0), v.y.toFixed(0), v.z.toFixed(0)].join(','), samp: samp.join('/') };
      }).filter(r => r.mesh > 3).sort((x, y) => y.mv - x.mv || y.mesh - x.mesh);
      return { label, rows: rows.slice(0, 18) };
    };
    const shop = scene.children.find(c => c.name === 'shop');
    const fair = scene.children.find(c => c.userData && c.userData.tag === 'fair');
    return [report(shop, 'shop'), report(fair, 'fair')];
  });
  r.forEach(g => {
    console.log('\n=== ' + g.label + ' 子组（mesh>3） ===');
    g.rows.forEach(x => console.log('  ', String(x.i).padStart(4), x.type.padEnd(8), 'mesh=' + String(x.mesh).padStart(4), '动=' + String(x.mv).padStart(4), 'pos=' + x.pos.padEnd(14), x.samp));
  });
  await b.close();
})();
