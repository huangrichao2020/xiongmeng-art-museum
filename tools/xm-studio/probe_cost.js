/* 全景机位下各顶层组的 draw call 贡献：逐个隐藏，量 calls 差值 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const SHOT = process.argv[3] || 'balloon-above';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(4000);
  await p.evaluate(s => window.XM.shot(s), SHOT);
  await p.waitForTimeout(3500);
  const r = await p.evaluate(async () => {
    const scene = window.__PROBE.scene, R = window.__PROBE.renderer;
    const settle = () => new Promise(res => { let i = 0; const t = () => { if (++i > 6) return res(); requestAnimationFrame(t); }; requestAnimationFrame(t); });
    await settle();
    const base = R.info.render.calls;
    const rows = [];
    for (const c of scene.children) {
      let mesh = 0; c.traverse(o => { if (o.isMesh) mesh++; });
      if (mesh < 5) continue;
      const was = c.visible; c.visible = false;
      await settle();
      const calls = R.info.render.calls;
      c.visible = was;
      await settle();
      rows.push({ tag: (c.userData && c.userData.tag) || c.name || ('Group:' + scene.children.indexOf(c)), mesh, cost: base - calls });
    }
    rows.sort((a, x) => x.cost - a.cost);
    return { base, rows: rows.slice(0, 22) };
  });
  console.log('全景机位', SHOT, ' 总 calls =', r.base);
  r.rows.forEach(g => console.log('  ', String(g.cost).padStart(5), 'calls  mesh=' + String(g.mesh).padStart(5), ' ', g.tag));
  await b.close();
})();
