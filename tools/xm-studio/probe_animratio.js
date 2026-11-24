/* 逐个顶层组对比「会动的比例」：找出被冻住的动画 */
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
  await p.waitForTimeout(7000);
  const r = await p.evaluate(async () => {
    const scene = window.__PROBE.scene;
    const snap = () => { const a = []; scene.updateMatrixWorld(true); scene.traverse(o => { if (o.isMesh) a.push([o.id, o.matrixWorld.elements.join(',')]); }); return a; };
    const A = snap();
    await new Promise(r => setTimeout(r, 2000));
    const B = snap();
    const ma = new Map(A);
    const moved = new Set();
    for (const [id, m] of B) if (ma.get(id) !== undefined && ma.get(id) !== m) moved.add(id);
    const rows = [];
    scene.children.forEach((g, i) => {
      let tot = 0, mv = 0;
      g.traverse(o => { if (o.isMesh) { tot++; if (moved.has(o.id)) mv++; } });
      if (tot >= 4) rows.push({ i, tag: (g.userData && g.userData.tag) || g.name || ('Group:' + i), tot, mv, ratio: +(mv / tot).toFixed(2) });
    });
    return rows;
  });
  console.log(JSON.stringify(r.map(x => x.tag + ':' + x.mv + '/' + x.tot + '(' + x.ratio + ')'), null, 0));
  await b.close();
})();
