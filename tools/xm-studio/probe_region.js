/* 区域地表扫描（2026-11-26）
   把相机架到正上方，对一个矩形区域按网格取「最上面那一层」的物体，
   输出一张 ASCII 地图 + 明细表。用来搞清某片区域到底被什么占着。

   用法： node probe_region.js x0 z0 x1 z1 [step]
   例：   node probe_region.js -50 -30 50 25 2
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

const x0 = Number(process.argv[2] ?? -50), z0 = Number(process.argv[3] ?? -30);
const x1 = Number(process.argv[4] ?? 50), z1 = Number(process.argv[5] ?? 25);
const step = Number(process.argv[6] ?? 2);

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = Math.abs(x1 - x0) + 20, h = Math.abs(z1 - z0) + 20;
  const camH = Math.max(w, h) * 1.25;
  await pg.evaluate(([cx, cz, camH]) => {
    window.MP.freezeCam(cx, camH, cz + 0.02, cx, 0, cz);
  }, [cx, cz, camH]);
  await pg.waitForTimeout(1500);

  const pts = [];
  for (let z = z0; z <= z1; z += step) for (let x = x0; x <= x1; x += step) pts.push([x, 0, z]);

  const res = await pg.evaluate((pts) => {
    const proj = window.diorama.camProject(pts);
    return pts.map((p, i) => {
      const [px, py] = proj[i];
      if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) return { ...p, off: true };
      const hits = window.diorama.pick(px, py);
      const g = hits.filter(h => h.pt[1] < 6).sort((a, b) => b.pt[1] - a.pt[1])[0];
      return { x: p[0], z: p[2], y: g ? +g.pt[1].toFixed(2) : null, col: g ? g.mt : '', tag: g ? g.tag : '', geo: g ? g.geo : '' };
    });
  }, pts);

  /* 明细：按 (color|tag|geo) 聚合，给出覆盖的网格点 */
  const map = new Map();
  for (const r of res) {
    if (r.off) continue;
    const k = `${r.col}|${r.tag}|${r.geo}`;
    if (!map.has(k)) map.set(k, { col: r.col, tag: r.tag, geo: r.geo, cells: [], ys: [] });
    const e = map.get(k); e.cells.push([r.x, r.z]); e.ys.push(r.y);
  }
  console.log(`\n区域 x[${x0},${x1}] z[${z0},${z1}] step=${step}  采样 ${res.length}\n`);
  const rows = [...map.values()].sort((a, b) => b.cells.length - a.cells.length);
  for (const e of rows) {
    const xs = e.cells.map(c => c[0]), zs = e.cells.map(c => c[1]);
    console.log(`${e.col.padEnd(8)} ${(e.tag || '-').padEnd(8)} ${e.geo.padEnd(16)} n=${String(e.cells.length).padEnd(4)} x[${Math.min(...xs)},${Math.max(...xs)}] z[${Math.min(...zs)},${Math.max(...zs)}] y[${Math.min(...e.ys)},${Math.max(...e.ys)}]`);
  }
  /* ASCII 地图 */
  const legend = rows.slice(0, 26);
  const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const key = new Map(legend.map((e, i) => [`${e.col}|${e.tag}|${e.geo}`, ch[i]]));
  console.log('\n--- ASCII（行 = z 从小到大，列 = x 从小到大）---');
  for (let z = z0; z <= z1; z += step) {
    let line = '';
    for (let x = x0; x <= x1; x += step) {
      const r = res.find(q => q.x === x && q.z === z);
      line += (r && !r.off && key.has(`${r.col}|${r.tag}|${r.geo}`)) ? key.get(`${r.col}|${r.tag}|${r.geo}`) : '.';
    }
    console.log(`z=${String(z).padStart(4)} ${line}`);
  }
  console.log('\n图例：');
  legend.forEach((e, i) => console.log(`  ${ch[i]}  ${e.col} ${e.tag || '-'} ${e.geo}`));

  await b.close();
})();
