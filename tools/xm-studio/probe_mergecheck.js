/* 诊断：自动合批有没有跑 + 手动 mergeStatic 一个组看效果 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  p.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => {
    const P = window.__PROBE;
    const count = (g) => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; };
    const g = P.scene.children[191];
    const before = count(g);
    const errs = [];
    let err = null;
    try { P.mergeStatic(g); } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
    const after = count(g);
    let keepCount = 0;
    P.scene.traverse(o => { if (o.userData && o.userData.keep) keepCount++; });
    return { phase: P._autoMerge ? P._autoMerge.phase : 'n/a', before, after, err, keepCount };
  });
  console.log('autoMerge phase =', r.phase, ' keep 节点数 =', r.keepCount);
  console.log('group191 mesh:', r.before, '→ 手动 mergeStatic 后', r.after, r.err ? ('错误: ' + r.err) : '');
  await b.close();
})();
