/* 找出 shop 内所有「会动」的 mesh：按二级祖先分组列出，方便回源码定位 */
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
  const r = await p.evaluate(async () => {
    const scene = window.__PROBE.scene;
    const shop = scene.children.find(c => c.name === 'shop');
    const snap = () => { const a = []; scene.traverse(o => { if (o.isMesh) a.push([o.id, o.matrixWorld.elements.join(',')]); }); return a; };
    const a = snap(); await new Promise(r => setTimeout(r, 1500)); const b2 = snap();
    const mapA = new Map(a); const moved = new Set();
    for (const [id, m] of b2) if (mapA.get(id) !== m) moved.add(id);
    // 按「shop 的直接子节点」和「再下一层」聚合
    const agg = new Map();
    shop.traverse(o => {
      if (!o.isMesh || !moved.has(o.id)) return;
      const chain = [];
      let n = o; while (n && n !== shop) { chain.unshift(n); n = n.parent; }
      const k1 = shop.children.indexOf(chain[0]);
      const k2 = chain.length > 2 ? chain[1].type + '#' + chain[1].children.indexOf(chain[2]) : '-';
      const key = k1 + '/' + k2;
      if (!agg.has(key)) agg.set(key, { k1, k2, n: 0, samples: [], wpos: null });
      const e = agg.get(key); e.n++;
      if (e.samples.length < 4) {
        const p = o.getWorldPosition(new window.__THREE.Vector3());
        e.samples.push(o.geometry.type + '/' + (o.material.color ? '#' + o.material.color.getHexString() : '-') + '/' + o.material.type);
        if (!e.wpos) e.wpos = [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)].join(',');
      }
    });
    return [...agg.values()].sort((x, y) => y.n - x.n);
  });
  console.log('shop 内动态 mesh 按「直接子节点 / 下一层」聚合:');
  r.forEach(g => console.log('  child#' + g.k1, g.k2.padEnd(14), 'n=' + String(g.n).padStart(4), 'pos=' + String(g.wpos).padEnd(18), g.samples.join(' | ')));
  await b.close();
})();
