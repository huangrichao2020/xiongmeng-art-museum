/* 动态检测：对每个顶层组，两次采样其全部后代的 world matrix，判断哪些是「会动」的 */
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
    const snap = () => {
      const arr = [];
      scene.children.forEach(c => {
        c.updateMatrixWorld(true);
        c.traverse(o => { if (o.isMesh) arr.push([o.id, o.matrixWorld.elements.join(',')]); });
      });
      return arr;
    };
    const a = snap();
    await new Promise(r => setTimeout(r, 1500));
    const b2 = snap();
    const mapA = new Map(a);
    const moved = new Set();
    for (const [id, m] of b2) {
      if (mapA.get(id) !== m) moved.add(id);
    }
    // 把 moved 的 mesh 归到它的顶层祖先
    const rows = [];
    scene.children.forEach((c, i) => {
      let mesh = 0, mv = 0;
      c.traverse(o => { if (o.isMesh) { mesh++; if (moved.has(o.id)) mv++; } });
      if (mesh < 15) return;
      rows.push({ i, tag: (c.userData && c.userData.tag) || c.name || '-', mesh, mv });
    });
    rows.sort((x, y) => y.mesh - x.mesh);
    return rows;
  });
  console.log('idx  tag/name         mesh  会动的mesh');
  r.forEach(g => console.log(String(g.i).padStart(4), ' ' + g.tag.padEnd(18), String(g.mesh).padStart(5), String(g.mv).padStart(6), g.mv ? '  <== 动态' : ''));
  await b.close();
})();
