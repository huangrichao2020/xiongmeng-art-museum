/* 细查某个顶层组内部构成：print children of fair / shop */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.XM.shot('balloon-above'));
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const dump = (root, label) => {
      const rows = root.children.map((c, i) => {
        let mesh = 0;
        c.traverse(o => { if (o.isMesh) mesh++; });
        return { i, type: c.type, name: c.name || '', tag: (c.userData && c.userData.tag) || '', mesh, kids: c.children.length };
      }).sort((a, b) => b.mesh - a.mesh);
      return { label, total: rows.length, rows: rows.slice(0, 14) };
    };
    const fair = scene.children.find(c => c.userData && c.userData.tag === 'fair');
    const shop = scene.children.find(c => c.name === 'shop');
    return [dump(fair, 'fair'), dump(shop, 'shop')];
  });
  r.forEach(g => {
    console.log('\n=== ' + g.label + ' 顶层子节点 ' + g.total + ' 个 ===');
    g.rows.forEach(x => console.log('  ', String(x.i).padStart(4), x.type.padEnd(14), (x.name + '/' + x.tag).padEnd(22), 'mesh=' + x.mesh, 'kids=' + x.kids));
  });
  await b.close();
})();
