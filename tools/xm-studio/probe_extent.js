/* 量场景的空间边界：所有 mesh 的世界包围盒分布（按 z 分桶），
   用来决定「超大号鸟巢」能放多大地、放在哪 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const accs = pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.diorama && window.diorama.scene, null, { timeout: 120000 });
  await pg.evaluate((a) => {
    const A = document.getElementById('mp-acc'), P = document.getElementById('mp-pass');
    if (A && P) { A.value = a; P.value = '123456'; document.getElementById('mp-go').click(); }
  }, accs.a);
  await pg.waitForTimeout(10000);
  const r = await pg.evaluate(() => {
    const sc = window.diorama.scene();
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, maxY = -1e9, n = 0;
    const buckets = {};
    sc.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      n++;
      minX = Math.min(minX, bb.min.x); maxX = Math.max(maxX, bb.max.x);
      minZ = Math.min(minZ, bb.min.z); maxZ = Math.max(maxZ, bb.max.z);
      maxY = Math.max(maxY, bb.max.y);
      const z0 = Math.floor(bb.min.z / 20) * 20;
      const key = z0;
      if (!buckets[key]) buckets[key] = { n: 0, x0: 1e9, x1: -1e9, y1: 0 };
      const bk = buckets[key];
      bk.n++; bk.x0 = Math.min(bk.x0, bb.min.x); bk.x1 = Math.max(bk.x1, bb.max.x);
      bk.y1 = Math.max(bk.y1, bb.max.y);
    });
    return { n, minX, maxX, minZ, maxZ, maxY, buckets };
  });
  console.log('mesh 总数', r.n);
  console.log('场景范围 x[', r.minX.toFixed(1), ',', r.maxX.toFixed(1), '] z[', r.minZ.toFixed(1), ',', r.maxZ.toFixed(1), '] 最高 y=', r.maxY.toFixed(1));
  console.log('--- 按 z 分桶（每 20m）---');
  Object.keys(r.buckets).map(Number).sort((a, b2) => a - b2).forEach(z => {
    const bk = r.buckets[z];
    console.log(`z ${z} ~ ${z + 20}: ${bk.n} 个 mesh, x[${bk.x0.toFixed(0)},${bk.x1.toFixed(0)}], 最高 y=${bk.y1.toFixed(1)}`);
  });
  await b.close();
})();
