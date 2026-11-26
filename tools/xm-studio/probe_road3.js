/* 环路路面占用扫描（2026-11-26）
   相机架在正上方，用 diorama.camProject 把环路采样点投影成屏幕像素，
   再用 diorama.pick 逐点问「这个像素正下方（地面那一层）压着什么」。

   用法： node probe_road3.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

/* —— 与主文件 LOOP 一致的取样（xA=44 zS=15 zN=-21 r=10 halfW=4.45） —— */
const L = { xA: 44, zS: 15, zN: -21, r: 10, halfW: 4.45 };
L.zSC = L.zS - L.r; L.zNC = L.zN + L.r;
L.sxLen = L.xA * 2; L.szLen = L.zSC - L.zNC; L.arcLen = Math.PI * 0.5 * L.r;
L.totalLen = 2 * L.sxLen + 2 * L.szLen + 4 * L.arcLen;
L.sample = function (s, off = 0) {
  let u = ((s % L.totalLen) + L.totalLen) % L.totalLen;
  if (u < L.sxLen) { const x = L.xA - u; return { x, z: L.zS + off }; }
  u -= L.sxLen;
  if (u < L.arcLen) { const a = Math.PI * .5 + (u / L.arcLen) * Math.PI * .5; return { x: -L.xA + (L.r + off) * Math.cos(a), z: L.zSC + (L.r + off) * Math.sin(a) }; }
  u -= L.arcLen;
  if (u < L.szLen) { const z = L.zSC - u; return { x: -(L.xA + L.r) - off, z }; }
  u -= L.szLen;
  if (u < L.arcLen) { const a = Math.PI + (u / L.arcLen) * Math.PI * .5; return { x: -L.xA + (L.r + off) * Math.cos(a), z: L.zNC + (L.r + off) * Math.sin(a) }; }
  u -= L.arcLen;
  if (u < L.sxLen) { const x = -L.xA + u; return { x, z: L.zN - off }; }
  u -= L.sxLen;
  if (u < L.arcLen) { const a = -Math.PI * .5 + (u / L.arcLen) * Math.PI * .5; return { x: L.xA + (L.r + off) * Math.cos(a), z: L.zNC + (L.r + off) * Math.sin(a) }; }
  u -= L.arcLen;
  const z = L.zNC + u; if (z < L.zSC) return { x: (L.xA + L.r) + off, z };
  const a = ((z - L.zSC) / L.arcLen) * Math.PI * .5; return { x: L.xA + (L.r + off) * Math.cos(a), z: L.zSC + (L.r + off) * Math.sin(a) };
};
/* 采样：沿环路每 2m，横向 ±3.6 / ±1.8 / 0 */
const PTS = [];
for (let s = 0; s < L.totalLen; s += 2) {
  for (const o of [-3.6, -1.8, 0, 1.8, 3.6]) {
    const q = L.sample(s, o);
    PTS.push({ s: +s.toFixed(0), o, x: +q.x.toFixed(2), z: +q.z.toFixed(2) });
  }
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 646 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  /* 正上方俯视 */
  await pg.evaluate(() => { window.MP.freezeCam(0, 200, 0.02, 0, 0, 0); });
  await pg.waitForTimeout(1200);

  const res = await pg.evaluate((pts) => {
    const proj = window.diorama.camProject(pts.map(p => [p.x, 0, p.z]));
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = proj[i];
      if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) { out.push({ ...pts[i], hit: 'offscreen' }); continue; }
      const hits = window.diorama.pick(px, py);
      /* 只看地面那一层（y<1）里最靠上的那个 = 真正盖住路面的东西 */
      const ground = hits.filter(h => h.pt[1] < 1.0).sort((a, b2) => b2.pt[1] - a.pt[1]);
      const g = ground[0];
      out.push({
        ...pts[i], px, py,
        y: g ? g.pt[1] : null, col: g ? g.mt : '', tag: g ? g.tag : '', geo: g ? g.geo : '',
        pt: g ? g.pt : null,
      });
    }
    return out;
  }, PTS);

  const bad = res.filter(r => r.hit !== 'offscreen' && r.y !== null && r.y > 0.06);
  console.log(`采样 ${res.length} 点，被盖 ${bad.length} 点`);
  const byS = {};
  for (const o of bad) { (byS[o.s] = byS[o.s] || []).push(o); }
  Object.keys(byS).map(Number).sort((a, b2) => a - b2).forEach(s => {
    console.log(`s=${s}m ` + byS[s].map(o => `[o${o.o} y=${o.y} ${o.col} ${o.tag} ${o.geo} @${o.x},${o.z}]`).join(' '));
  });
  const off = res.filter(r => r.hit === 'offscreen');
  if (off.length) console.log('出画采样点', off.length, '（相机覆盖不够）');

  await b.close();
})();
