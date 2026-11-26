/* 环路净空探测 v2（2026-11-26）
   沿环路中线 + 内外两侧偏移线扫一遍，列出「压在路面上」的实体。
   判定：某实体的 XZ 包围盒覆盖采样点，且它的垂直范围和路面高度区间 [0, 0.6] 有交集
        （也就是说它像一块板子铺在马路上，或从地面往上盖住马路）。
   排除：巨大的天空盒 / 雪地底板（XZ 尺寸都 > 25m）、路面本身。

   用法： node probe_ring.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

const L = { xA: 44, zS: 15, zN: -21, r: 10, halfW: 4.45 };
L.zSC = L.zS - L.r; L.zNC = L.zN + L.r;
L.sxLen = L.xA * 2; L.szLen = L.zSC - L.zNC; L.arcLen = Math.PI * 0.5 * L.r;
L.totalLen = 2 * L.sxLen + 2 * L.szLen + 4 * L.arcLen;
L.sample = function (s, off = 0) {
  let u = ((s % L.totalLen) + L.totalLen) % L.totalLen;
  if (u < L.sxLen) { const x = L.xA - u; return { x, z: L.zS + off, seg: '南段' }; }
  u -= L.sxLen;
  if (u < L.arcLen) { const a = Math.PI * .5 + (u / L.arcLen) * Math.PI * .5; return { x: -L.xA + (L.r + off) * Math.cos(a), z: L.zSC + (L.r + off) * Math.sin(a), seg: '西南角' }; }
  u -= L.arcLen;
  if (u < L.szLen) { const z = L.zSC - u; return { x: -(L.xA + L.r) - off, z, seg: '西段' }; }
  u -= L.szLen;
  if (u < L.arcLen) { const a = Math.PI + (u / L.arcLen) * Math.PI * .5; return { x: -L.xA + (L.r + off) * Math.cos(a), z: L.zNC + (L.r + off) * Math.sin(a), seg: '西北角' }; }
  u -= L.arcLen;
  if (u < L.sxLen) { const x = -L.xA + u; return { x, z: L.zN - off, seg: '北段' }; }
  u -= L.sxLen;
  if (u < L.arcLen) { const a = -Math.PI * .5 + (u / L.arcLen) * Math.PI * .5; return { x: L.xA + (L.r + off) * Math.cos(a), z: L.zNC + (L.r + off) * Math.sin(a), seg: '东北角' }; }
  u -= L.arcLen;
  if (u < L.szLen) { const z = L.zNC + u; return { x: (L.xA + L.r) + off, z, seg: '东段' }; }
  u -= L.szLen;
  const a = ((u) / L.arcLen) * Math.PI * .5; return { x: L.xA + (L.r + off) * Math.cos(a), z: L.zSC + (L.r + off) * Math.sin(a), seg: '东南角' };
};

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui&audit=1', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.__xmPreMerge && window.__xmPreMerge.length, null, { timeout: 180000 });

  const OFFS = process.argv[2] ? process.argv[2].split(',').map(Number) : [-3.6, -1.8, 0, 1.8, 3.6];
  const MINXZ = process.argv[4] ? Number(process.argv[4]) : 0;
  const label = process.argv[3] || '路面带';
  const pts = [];
  for (let s = 0; s < L.totalLen; s += 1) {
    for (const off of OFFS) {
      const q = L.sample(s, off);
      pts.push({ s: +s.toFixed(0), off, seg: q.seg, x: +q.x.toFixed(2), z: +q.z.toFixed(2) });
    }
  }
  await pg.evaluate((v) => { window.__probeMinXZ = v; }, MINXZ);
  const res = await pg.evaluate((pts) => {
    const list = window.__xmPreMerge;
    return pts.map(p => {
      const hits = [];
      for (const o of list) {
        const dx = o.mx[0] - o.mn[0], dz = o.mx[2] - o.mn[2];
        if (dx > 25 && dz > 25) continue;              // 天空盒 / 雪地大底板
        const MINXZ = window.__probeMinXZ || 0;
        if (Math.max(dx, dz) < MINXZ) continue;        // 太小的碎块（行驶中的车 / 零件）
        if (o.mn[1] > 1.2) continue;                     // 整个悬空的（灯锥之类）
        if (o.mx[1] < 0.02) continue;                    // 埋在地下
        if (p.x < o.mn[0] - .3 || p.x > o.mx[0] + .3) continue;
        if (p.z < o.mn[2] - .3 || p.z > o.mx[2] + .3) continue;
        // 垂直方向：这块板子有没有覆盖路面高度 [0.02,0.6]
        const top = o.mx[1], bot = o.mn[1];
        if (bot > 0.62) continue;
        hits.push({ tag: o.tag, c: o.c, chain: o.chain, mn: o.mn, mx: o.mx });
      }
      return { s: p.s, off: p.off, seg: p.seg, x: p.x, z: p.z, hits };
    });
  }, pts);

  /* 汇总：同一物件 → 覆盖的 s 区间 */
  const byKey = new Map();
  for (const r of res) {
    for (const h of r.hits) {
      const key = h.c + '|' + h.chain + '|' + h.tag + '|' + JSON.stringify(h.mn) + '|' + JSON.stringify(h.mx);
      if (!byKey.has(key)) byKey.set(key, { info: h, ss: new Set(), segs: new Set() });
      const e = byKey.get(key);
      e.ss.add(r.s); e.segs.add(r.seg);
    }
  }
  console.log(`\n===== ${label}（offsets ${OFFS.join(',')}）=====\n`);
  const rows = [...byKey.values()].map(e => {
    const ss = [...e.ss].sort((a, b) => a - b);
    let lo = ss[0], hi = ss[0], ranges = [];
    for (const s of ss.slice(1)) { if (s - hi > 2) { ranges.push([lo, hi]); lo = s; } hi = s; }
    ranges.push([lo, hi]);
    return { info: e.info, ranges, segs: [...e.segs].join(','), n: ss.length };
  }).sort((a, b) => b.n - a.n);

  for (const r of rows) {
    const h = r.info;
    console.log(`${h.c.padEnd(8)} ${(h.tag || '-').padEnd(8)} ${r.segs.padEnd(12)} s=${r.ranges.map(([a, b]) => `${a}~${b}`).join(' ')}`);
    console.log(`        chain=${h.chain}  bbox=[${h.mn.join(',')}]..[${h.mx.join(',')}]  hits=${r.n}`);
  }
  await b.close();
})();
