/* 统计某组内 mesh 数 / 唯一材质数 / 材质参数分布 */
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
    const mats = new Map();
    let mesh = 0;
    g.traverse(o => {
      if (!o.isMesh) return;
      mesh++;
      const m = o.material;
      if (!mats.has(m.uuid)) mats.set(m.uuid, { type: m.type, color: m.color ? m.color.getHexString() : '-', rough: m.roughness, metal: m.metalness, n: 0, hasMap: !!m.map, transparent: m.transparent, emissive: m.emissive ? m.emissive.getHexString() : '-' });
      mats.get(m.uuid).n++;
    });
    return { mesh, uniq: mats.size, list: [...mats.values()].sort((a, b) => b.n - a.n).slice(0, 18) };
  }, IDX);
  console.log('group', IDX, 'meshes', r.mesh, '唯一材质', r.uniq);
  r.list.forEach(m => console.log('  ', String(m.n).padStart(3), m.type.padEnd(20), 'color=#' + m.color, 'rough=' + m.rough, 'metal=' + m.metal, 'map=' + m.hasMap, 'tr=' + m.transparent, 'em=#' + m.emissive));
  await b.close();
})();
