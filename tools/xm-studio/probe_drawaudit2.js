/* 揪出 draw call 大户：列出 mesh 数最多的顶层组，它们的位置/结构/代表物体 */
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
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const rows = [];
    for (let i=0;i<scene.children.length;i++){
      const root = scene.children[i];
      let meshes=0, inst=0, tris=0, samples=[];
      root.traverse(o => {
        if (!o.visible) return;
        if (o.isInstancedMesh){ inst++; const g=o.geometry; tris += (g.index?g.index.count:g.attributes.position.count)/3*o.count; }
        else if (o.isMesh||o.isPoints||o.isLine){
          meshes++; const g=o.geometry;
          if (g&&g.attributes&&g.attributes.position) tris += (g.index?g.index.count:g.attributes.position.count)/3;
          if (samples.length<4) samples.push((g?g.type:'?')+':'+(o.material&&o.material.type||'')+'@'+o.position.toArray().map(v=>v.toFixed(0)).join(','));
        }
      });
      if (meshes+inst > 60) rows.push({ i, name:root.name||root.type, tag:root.userData&&root.userData.tag||'', meshes, inst, tris:Math.round(tris),
        pos:root.position.toArray().map(v=>+v.toFixed(1)), samples });
    }
    rows.sort((a,b)=>(b.meshes+b.inst)-(a.meshes+a.inst));
    return { rows, total: scene.children.length };
  });
  console.log('scene 顶层子节点数', r.total);
  r.rows.forEach(x => {
    console.log(`#${x.i} ${x.name} tag=${x.tag} mesh=${x.meshes} inst=${x.inst} tri=${x.tris} pos=${x.pos}`);
    console.log('    ', x.samples.join(' | '));
  });
  await b.close();
})();
