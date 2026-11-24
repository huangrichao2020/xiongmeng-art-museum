/* 识别未合批的顶层组：位置 + 样本几何 + keep 标记 */
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
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const V = window.__THREE.Vector3;
    const rows = [];
    scene.children.forEach((c, i) => {
      let mesh = 0, keeps = 0;
      const samples = [];
      c.traverse(o => {
        if (o.userData && o.userData.keep) keeps++;
        if (o.isMesh) { mesh++; if (samples.length < 3) samples.push(o.geometry.type + '/' + (o.material.type || '')); }
      });
      if (mesh < 20) return;
      const v = new V(); c.getWorldPosition(v);
      rows.push({ i, tag: (c.userData && c.userData.tag) || '', name: c.name || '', mesh, keeps,
        pos: [v.x.toFixed(0), v.y.toFixed(0), v.z.toFixed(0)].join(','), samples: samples.join(' ') });
    });
    rows.sort((a, b2) => b2.mesh - a.mesh);
    return rows;
  });
  console.log('idx tag/name            mesh  keep  worldpos        samples');
  r.forEach(g => console.log(String(g.i).padStart(4), (g.tag || g.name || '-').padEnd(18), String(g.mesh).padStart(5), String(g.keeps).padStart(5), ' ', g.pos.padEnd(14), g.samples));
  await b.close();
})();
