/* 估算「同色不同材质实例」的合批潜力：按材质签名（忽略颜色）统计 */
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
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => {
    const scene = window.__PROBE.scene;
    const sig = (m) => {
      if (!m) return null;
      if (m.map || m.alphaMap || m.normalMap || m.roughnessMap || m.metalnessMap || m.aoMap || m.emissiveMap || m.bumpMap || m.envMap) return null;
      if (m.transparent || m.opacity < 1) return null;
      if (m.onBeforeCompile) return null;
      if (m.vertexColors) return null;
      if (m.isMeshBasicMaterial) return 'B|' + m.side + '|' + m.toneMapped + '|' + m.depthWrite + '|' + m.blending;
      if (m.isMeshStandardMaterial) return 'S|' + m.side + '|' + m.flatShading + '|' + m.roughness + '|' + m.metalness + '|' + (m.envMapIntensity || 0) + '|' + (m.emissive ? m.emissive.getHexString() : '0') + '|' + (m.emissiveIntensity || 0) + '|' + m.toneMapped + '|' + m.depthWrite + '|' + m.blending;
      return null;
    };
    let mesh = 0, sameMat = 0, fam = 0, noFam = 0;
    const famCount = new Map();
    scene.traverse(o => {
      if (!o.isMesh) return;
      mesh++;
      const s = sig(o.material);
      if (!s) { noFam++; return; }
      fam++;
      const k = s + '|' + (o.castShadow ? 1 : 0);
      famCount.set(k, (famCount.get(k) || 0) + 1);
    });
    const buckets = famCount.size;
    const saved = fam - buckets;
    return { mesh, fam, noFam, buckets, saved, top: [...famCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10) };
  });
  console.log('场景 mesh 总数', r.mesh, '| 可归族', r.fam, '| 不可归族(贴图/透明/自定义shader)', r.noFam);
  console.log('归族后桶数', r.buckets, '→ 可省 draw call', r.saved);
  r.top.forEach(x => console.log('   ', String(x[1]).padStart(4), '→', x[0].slice(0, 60)));
  await b.close();
})();
