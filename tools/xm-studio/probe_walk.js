/* 复刻 mergeStatic 的 walk，看它到底走到多少 mesh、开了几个桶 */
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
    const g = scene.children[IDX];
    const buckets = new Map();
    let found = 0, skippedKeep = 0, skippedInst = 0, nonMesh = 0;
    const walk = (o, depth) => {
      for (const ch of o.children) {
        if (ch.userData && ch.userData.keep) { skippedKeep++; continue; }
        if (ch.isInstancedMesh) { skippedInst++; continue; }
        if (ch.isMesh) {
          found++;
          const key = ch.material.uuid + '|' + (ch.castShadow ? 1 : 0) + '|' + ch.renderOrder;
          buckets.set(key, (buckets.get(key) || 0) + 1);
        } else { nonMesh++; walk(ch, depth + 1); }
      }
    };
    walk(g, 0);
    const kids = g.children.map((c, i) => ({ i, type: c.type, kids: c.children.length, keep: !!(c.userData && c.userData.keep), isMesh: !!c.isMesh, isInst: !!c.isInstancedMesh, mat: c.material ? c.material.uuid.slice(0, 6) : '-' }));
    return { found, buckets: buckets.size, skippedKeep, skippedInst, nonMesh, kids, bucketList: [...buckets.entries()].map(([k, v]) => k.slice(0, 8) + '×' + v).slice(0, 20) };
  }, IDX);
  console.log('walk 找到 mesh:', r.found, '桶:', r.buckets, 'keep跳过:', r.skippedKeep, 'inst跳过:', r.skippedInst, '递归到的非mesh节点:', r.nonMesh);
  console.log('kids:', JSON.stringify(r.kids));
  console.log('buckets:', r.bucketList.join(', '));
  await b.close();
})();
