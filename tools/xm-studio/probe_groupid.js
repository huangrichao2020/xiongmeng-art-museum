const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.__PROBE && window.XM, { timeout:120000 });
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const out = [];
    for (const idx of [284, 191, 221, 130]) {
      const root = scene.children[idx];
      if (!root) { out.push({idx, err:'none'}); continue; }
      const kids = root.children.slice(0, 8).map(c => {
        const g = c.geometry;
        const m = c.material;
        return `${c.name||c.type}|${g?g.type:'?'}|${m?m.type:'?'}|${m&&m.color?'#'+m.color.getHexString():''}|p=${c.position.toArray().map(v=>+v.toFixed(1))}|kids=${c.children.length}|keep=${!!(c.userData&&c.userData.keep)}`;
      });
      out.push({ idx, pos:root.position.toArray().map(v=>+v.toFixed(1)), n:root.children.length, kids });
    }
    // 找 shop / shop1 的 mesh 数
    const cnt = {};
    scene.children.forEach((c,i)=>{ if(c.name==='shop'||c.name==='shop1') cnt[c.name]=i; });
    return { out, cnt };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
