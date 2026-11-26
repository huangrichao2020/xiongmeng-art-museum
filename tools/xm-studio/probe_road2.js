/* 环路体检（2026-11-26）
   1) 用沙盘默认机位出一张俯视图，对齐用户截图里红箭头那一处
   2) 沿整条闭合环路逐米统计「压在路面上的实体」
   3) 统计沿线人行道 / 路缘石 / 路灯 / 行道树的连续性

   用法： node probe_road2.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

/* LOOP: xA=44 zS=15 zN=-21 r=10 halfW=4.45 */
const L = { xA: 44, zS: 15, zN: -21, r: 10, halfW: 4.45 };
const xW = L.xA + L.r, xE = L.xA + L.r, zSC = L.zS - L.r, zNC = L.zN + L.r;

/* 路面中心线到 x 的反解（南北两段） */
const segOf = (x, z) => {
  if (z > L.zSC - 1 && z < L.zSC + 1) return { id: '南段', cx: x };
  if (z > L.zNC - 1 && z < L.zNC + 1) return { id: '北段', cx: x };
  if (x > xW - 1 && x < xW + 1) return { id: '西段', cz: z };
  if (x > xE - 1 && x < xE + 1) return { id: '东段', cz: z };
  return null;
};

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 646 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui&audit=1', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  /* 关掉开场镜头动画，回到沙盘默认机位 */
  await pg.evaluate(() => { try { window.MP.camSet && window.MP.camSet([0, 0, 0], [0, 0, 0]); } catch (e) {} });
  await pg.waitForTimeout(500);
  const cam = await pg.evaluate(() => window.diorama.cam());
  console.log('相机', JSON.stringify(cam));
  await pg.screenshot({ path: '/tmp/road2_sandbox.png' });

  await pg.waitForFunction(() => window.__xmPreMerge && window.__xmPreMerge.length, null, { timeout: 180000 });

  const report = await pg.evaluate((L) => {
    const list = window.__xmPreMerge;
    const halfW = L.halfW;
    const out = { onRoad: [], nearEdge: [], roadLike: [], sidewalk: [], curb: [], lamp: [], tree: [] };

    /* 路面中心线：南段 z=15（x∈[-44,44]）、北段 z=-21、西段 x=-54、东段 x=54 */
    const inRoad = (mn, mx) => {
      const z1 = mn[2], z2 = mx[2], x1 = mn[0], x2 = mx[0];
      /* 南段 */
      if (x2 > -L.xA && x1 < L.xA && z2 > L.zS - halfW && z1 < L.zS + halfW) return '南段';
      /* 北段 */
      if (x2 > -L.xA && x1 < L.xA && z2 > L.zN - halfW && z1 < L.zN + halfW) return '北段';
      /* 西段 */
      if (z2 > L.zN && z1 < L.zS && x2 > -(L.xA + L.r) - halfW && x1 < -(L.xA + L.r) + halfW) return '西段';
      /* 东段 */
      if (z2 > L.zN && z1 < L.zS && x2 > (L.xA + L.r) - halfW && x1 < (L.xA + L.r) + halfW) return '东段';
      return '';
    };
    /* 距路面外沿多近（只算内侧/外侧 1.2m 内） */
    const edgeDist = (mn, mx) => {
      let best = 99;
      const consider = (a, b, c) => { const v = c - a; if (v < best) best = v; };
      /* 南段：z 在 [10.55,19.45] */
      if (mx[0] > -L.xA && mn[0] < L.xA) {
        consider(mn[2], mx[2], 0);
        const d1 = Math.abs(mn[2] - (L.zS + halfW)), d2 = Math.abs(mx[2] - (L.zS + halfW));
        const d3 = Math.abs(mn[2] - (L.zS - halfW)), d4 = Math.abs(mx[2] - (L.zS - halfW));
        best = Math.min(best, d1, d2, d3, d4);
        const e1 = Math.abs(mn[2] - (L.zN + halfW)), e2 = Math.abs(mx[2] - (L.zN + halfW));
        const e3 = Math.abs(mn[2] - (L.zN - halfW)), e4 = Math.abs(mx[2] - (L.zN - halfW));
        best = Math.min(best, e1, e2, e3, e4);
      }
      return best;
    };

    for (const o of list) {
      const h = o.mx[1] - o.mn[1];
      const w = o.mx[0] - o.mn[0], d = o.mx[2] - o.mn[2];
      const area = Math.max(w, d);
      const rec = {
        tag: o.tag, c: o.c, gt: o.gt, chain: o.chain, inst: o.inst,
        mn: o.mn, mx: o.mx,
        h: +h.toFixed(2), w: +w.toFixed(2), d: +d.toFixed(2),
      };
      const band = inRoad(o.mn, o.mx);
      const flat = h < 0.35;                 // 贴地的薄板（路面/车道线/路缘/人行道）
      const low = o.mn[1] < 0.6 && h > 0.45; // 立在地面上的实体
      if (band && low && !flat) out.onRoad.push(Object.assign({ band }, rec));
      else if (band && flat && h > 0.05 && area > 3) out.roadLike.push(Object.assign({ band }, rec));
      else if (!band && edgeDist(o.mn, o.mx) < 1.6 && low) out.nearEdge.push(Object.assign({ band: '沿路', d: +edgeDist(o.mn, o.mx).toFixed(2) }, rec));
    }
    out.onRoad.sort((a, b) => (b.h - a.h));
    out.nearEdge.sort((a, b) => a.d - b.d);
    out.roadLike.sort((a, b) => b.w - a.w);
    return out;
  }, L);

  const pr = (arr, n) => { console.log(`--- ${n} (${arr.length}) ---`); arr.slice(0, n).forEach(o => console.log(JSON.stringify(o))); };
  pr(report.onRoad, 40);
  pr(report.roadLike, 20);
  pr(report.nearEdge, 30);

  await b.close();
})();
