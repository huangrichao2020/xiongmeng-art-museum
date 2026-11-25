/* 马路遮挡体检：抓合批前全场物件快照，按 LOOP 马路带筛出挡视线的 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

/* LOOP 马路带（路面半宽 4.45，中心线 x∈[-44,44] z∈[-21,15]） */
const BANDS = [
  { id: '南段', x0: -54, x1: 54, z0: 10.55, z1: 19.45 },
  { id: '北段', x0: -54, x1: 54, z0: -25.45, z1: -16.55 },
  { id: '西段', x0: -58.45, x1: -49.55, z0: -21, z1: 15 },
  { id: '东段', x0: 49.55, x1: 58.45, z0: -21, z1: 15 }
];
const inBand = (mn, mx) => BANDS.filter(b =>
  mx[0] >= b.x0 && mn[0] <= b.x1 && mx[2] >= b.z0 && mn[2] <= b.z1
).map(b => b.id);

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui&audit=1', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.__xmPreMerge && window.__xmPreMerge.length, null, { timeout: 120000 });
  const res = await pg.evaluate((bands) => {
    const list = window.__xmPreMerge;
    const hits = [];
    for (const o of list) {
      const bandsHit = bands.filter(b =>
        o.mx[0] >= b.x0 && o.mn[0] <= b.x1 && o.mx[2] >= b.z0 && o.mn[2] <= b.z1
      ).map(b => b.id);
      if (!bandsHit.length) continue;
      const h = o.mx[1] - o.mn[1];
      const w = Math.max(o.mx[0] - o.mn[0], o.mx[2] - o.mn[2]);
      /* 筛选：悬在路面上方（底面 1.0~7m）挡视线，或立在路中间（底面贴地且高>1.2） */
      const overhead = o.mn[1] >= 1.0 && o.mn[1] <= 7.0 && o.mx[1] > 2.2;
      const onRoad = o.mn[1] < 0.6 && h > 1.3;
      const wide = w > 6 && o.mn[1] > 1.0 && o.mn[1] <= 7.0;
      if (overhead || onRoad || wide) hits.push({
        tag: o.tag, c: o.c, band: bandsHit.join('+'),
        mn: o.mn, mx: o.mx, h: +h.toFixed(2), w: +w.toFixed(2),
        why: overhead ? '悬在路面上方' : (onRoad ? '立在路中间' : '跨路大件')
      });
    }
    hits.sort((a, b2) => (b2.mn[1] - a.mn[1]) || (b2.w - a.w));
    return { total: list.length, hits };
  }, BANDS);
  console.log('全场景物件 ' + res.total + ' 个，疑似挡路 ' + res.hits.length + ' 个');
  res.hits.slice(0, 45).forEach(h => console.log(JSON.stringify(h)));
  const gate = await pg.evaluate(() => {
    const list = window.__xmPreMerge; const out = [];
    for (const o of list) {
      if (o.mx[0] < -13 || o.mn[0] > 15) continue;
      if (o.mx[2] < 5.5 || o.mn[2] > 10.5) continue;
      if (o.mx[1] < 1.6) continue;
      out.push({ tag: o.tag, c: o.c, mn: o.mn, mx: o.mx, w: +(o.mx[0]-o.mn[0]).toFixed(1), h: +(o.mx[1]-o.mn[1]).toFixed(1) });
    }
    out.sort((a,b)=>b.mn[1]-a.mn[1]);
    return out;
  });
  console.log('--- 正门区域 1.6m 以上物件 ' + gate.length + ' ---');
  gate.slice(0,22).forEach(g=>console.log(JSON.stringify(g)));
  console.log(errs.length ? 'ERRORS ' + errs.slice(0, 3).join(' | ') : 'no page errors');
  await b.close();
})();
