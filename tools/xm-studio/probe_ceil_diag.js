/* 诊断：帐篷天花板到底是谁在挡
   ① 场景里有没有深棕色(3b2b1f)网格（内衬）
   ② 从帐内往天花板打射线，看第一个命中的是内衬还是红白帆布
   ③ 内衬那个组的子节点数（合批后应为 0） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 640 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);

  const info = await pg.evaluate(() => {
    const sc = window.diorama.scene();
    const out = { dark: [], red: [], cream: [], total: 0 };
    sc.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.color) return;
      out.total++;
      const hex = o.material.color.getHexString();
      if (hex === '3b2b1f') out.dark.push({ geo: o.geometry.type, side: o.material.side, tris: o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3 });
      if (hex === 'be3a2c') out.red.push(o.geometry.type);
      if (hex === 'eee0c2') out.cream.push(o.geometry.type);
    });
    return out;
  });
  console.log('场景 mesh 总数:', info.total);
  console.log('深棕内衬网格:', JSON.stringify(info.dark));
  console.log('红帆布网格:', JSON.stringify(info.red));
  console.log('白帆布网格:', JSON.stringify(info.cream));

  /* 从帐内中心往篷顶多个方向打射线 */
  const rays = [
    ['正上顶', 50, 1.0, 30, 50, 8.6, 30],
    ['斜上顶', 50, 1.7, 33.5, 50, 6.4, 28.5],
    ['近檐口', 50, 2.0, 31.0, 50, 6.0, 29.0]
  ];
  for (const [name, ...c] of rays) {
    const hits = await pg.evaluate(a => window.diorama.ray(a[0], a[1], a[2], a[3], a[4], a[5]), c);
    console.log(name, '→', JSON.stringify(hits));
  }
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
