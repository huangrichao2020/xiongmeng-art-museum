/* 动画存活检查：2 秒内有多少 mesh 的世界矩阵变了（对比基线/新版的数字） */
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
  await p.waitForTimeout(7000);
  const r = await p.evaluate(async () => {
    const scene = window.__PROBE.scene;
    const snap = () => { const a = []; scene.updateMatrixWorld(true); scene.traverse(o => { if (o.isMesh) a.push([o.id, o.matrixWorld.elements.join(',')]); }); return a; };
    const A = snap();
    await new Promise(r => setTimeout(r, 2000));
    const B = snap();
    const ma = new Map(A);
    let moved = 0, total = 0;
    for (const [id, m] of B) { total++; if (ma.get(id) !== undefined && ma.get(id) !== m) moved++; }
    // 关键对象的位移
    const V = window.__THREE.Vector3;
    const p1 = new V(), p2 = new V();
    const probe = (o) => { if (!o) return null; o.getWorldPosition(p1); return [p1.x.toFixed(2), p1.y.toFixed(2), p1.z.toFixed(2)].join(','); };
    const w = window.__PROBE.amusement && window.__PROBE.amusement.wheel;
    return { moved, total, wheelRot: w ? w.rotation.z.toFixed(3) : 'n/a', wheelPos: probe(w), cab0: probe(window.__PROBE.amusement && window.__PROBE.amusement.cabs && window.__PROBE.amusement.cabs[0]) };
  });
  console.log('2 秒内位置/朝向变了的 mesh:', r.moved, '/', r.total);
  console.log('摩天轮 rotation.z =', r.wheelRot, ' pos =', r.wheelPos, ' 吊篮0 =', r.cab0);
  await b.close();
})();
