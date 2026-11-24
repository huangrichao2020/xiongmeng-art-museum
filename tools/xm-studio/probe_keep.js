/* 看某个组里哪些 mesh 被标了 keep，以及它们的位置 */
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
  await p.waitForTimeout(6000);
  const r = await p.evaluate((IDX) => {
    const scene = window.__PROBE.scene;
    const V = window.__THREE.Vector3;
    const g = scene.children[IDX];
    const rows = [];
    g.traverse(o => {
      if (!o.isMesh) return;
      const pos = o.getWorldPosition(new V());
      rows.push({ keep: !!(o.userData && o.userData.keep), t: o.geometry.type, c: o.material.color ? o.material.color.getHexString() : '-',
        p: [pos.x.toFixed(1), pos.y.toFixed(1), pos.z.toFixed(1)].join(',') });
    });
    const byKeep = {};
    rows.forEach(r => { const k = r.keep ? 'keep' : 'free'; byKeep[k] = byKeep[k] || []; byKeep[k].push(r); });
    const summary = {};
    for (const k in byKeep) {
      const m = new Map();
      byKeep[k].forEach(r => { const key = r.t + '/#' + r.c; m.set(key, (m.get(key) || 0) + 1); });
      summary[k] = { n: byKeep[k].length, kinds: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) };
    }
    return { total: rows.length, summary, samplePos: byKeep.keep ? byKeep.keep.slice(0, 5).map(r => r.p) : [] };
  }, IDX);
  console.log('group', IDX, 'meshes', r.total);
  for (const k in r.summary) {
    console.log(' ', k, 'n=' + r.summary[k].n);
    r.summary[k].kinds.forEach(x => console.log('     ', String(x[1]).padStart(3), x[0]));
  }
  console.log(' keep 样本位置:', r.samplePos.join(' / '));
  await b.close();
})();
