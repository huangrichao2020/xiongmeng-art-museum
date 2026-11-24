/* 顶层分组细查：每个 scene 直接子节点的 tag / 名字 / 子节点数 / 可见 mesh 数 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.XM.shot('balloon-above'));
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const out = [];
    scene.children.forEach((c, i) => {
      let mesh = 0, inst = 0, vis = 0;
      c.traverse(o => {
        if (o.isInstancedMesh) inst++;
        else if (o.isMesh) { mesh++; if (o.visible) vis++; }
      });
      out.push({ i, name: c.name || (c.type+':'+i), tag: c.userData && c.userData.tag || '', kids: c.children.length, mesh, inst, vis, type: c.type });
    });
    out.sort((a,b)=>b.mesh-a.mesh);
    return out.slice(0, 26);
  });
  console.log('idx  name/tag                     kids  mesh  inst   vis');
  r.forEach(g => console.log(String(g.i).padStart(4), (g.name+'/'+g.tag).padEnd(28), String(g.kids).padStart(5), String(g.mesh).padStart(5), String(g.inst).padStart(4), String(g.vis).padStart(5)));
  await b.close();
})();
