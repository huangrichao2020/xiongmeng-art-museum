/* 程序/材质/贴图 统计：定位 shader 链接开销 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(6000);
  const out = await pg.evaluate(() => {
    const scene = window.diorama.scene();
    // 从 renderer 拿 program 数
    const R = window.__renderer || (window.MP && window.MP.renderer) || null;
    const info = window.diorama.perf();
    const matTypes = {};
    const defs = {};
    scene.traverse(o => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(m => {
        if (!m) return;
        const t = m.type + (m.transparent ? 'T' : '') + (m.alphaTest > 0 ? 'A' : '');
        matTypes[t] = (matTypes[t] || 0) + 1;
        const d = [];
        if (m.map) d.push('map');
        if (m.normalMap) d.push('nrm');
        if (m.emissiveMap) d.push('emi');
        if (m.roughnessMap) d.push('rgh');
        if (m.bumpMap) d.push('bmp');
        if (m.alphaMap) d.push('alp');
        if (m.vertexColors) d.push('vc');
        if (m.flatShading) d.push('flat');
        if (m.envMap) d.push('env');
        if (m.isInstancedMesh) d.push('inst');
        if (m.alphaTest > 0) d.push('atest');
        if (m.transparent) d.push('trans');
        if (m.emissive && m.emissiveIntensity > 0) d.push('emiI');
        const k = d.sort().join(',');
        defs[k] = (defs[k] || 0) + 1;
      });
    });
    const topDefs = Object.entries(defs).sort((a, b) => b[1] - a[1]).slice(0, 25);
    return { perf: info, matTypes, topDefs, hasR: !!R };
  });
  console.log('perf', JSON.stringify(out.perf));
  console.log('--- material types ---');
  Object.entries(out.matTypes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(String(v).padStart(5), k));
  console.log('--- define combos (top 25) ---');
  out.topDefs.forEach(([k, v]) => console.log(String(v).padStart(5), k || '(none)'));
  await b.close();
})();
