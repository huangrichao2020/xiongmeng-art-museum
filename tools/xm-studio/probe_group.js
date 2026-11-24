/* 查某个顶层组的内部构成明细 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const IDX = parseInt(process.argv[3] || '191', 10);
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(5000);
  const r = await p.evaluate((IDX) => {
    const scene = window.__PROBE.scene;
    const g = scene.children[IDX];
    const V = window.__THREE.Vector3;
    const v = new V(); g.getWorldPosition(v);
    const kids = g.children.map((c, i) => {
      let mesh = 0; c.traverse(o => { if (o.isMesh) mesh++; });
      return { i, type: c.type, mesh, kids: c.children.length, keep: !!(c.userData && c.userData.keep) };
    });
    const samples = [];
    g.traverse(o => { if (o.isMesh && samples.length < 14) { const p2 = o.getWorldPosition(new V()); samples.push(o.geometry.type + '/' + o.material.type + '/#' + (o.material.color ? o.material.color.getHexString() : '-')); } });
    return { pos: [v.x.toFixed(1), v.y.toFixed(1), v.z.toFixed(1)].join(','), kids, samples, total: (() => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; })() };
  }, IDX);
  console.log('group', IDX, 'pos', r.pos, 'meshes', r.total);
  console.log('kids:', JSON.stringify(r.kids));
  console.log('samples:', r.samples.join(' | '));
  await b.close();
})();
