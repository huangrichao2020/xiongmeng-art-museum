/* 钢梁到底在不在：查 nest 组里的 InstancedMesh 实例矩阵 + 从相机打射线看命中谁 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 300)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(11000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  });
  await pg.waitForTimeout(1000);

  const r = await pg.evaluate(() => {
    const sc = window.diorama.scene();
    let nest = null;
    sc.traverse(o => { if (o.userData && o.userData.tag === 'nest' && !nest) nest = o; });
    if (!nest) return { err: 'no nest' };
    nest.updateMatrixWorld(true);
    const out = { inst: [], meshes: [] };
    nest.traverse(o => {
      if (o.isInstancedMesh) {
        const m = o.instanceMatrix.array;
        const first = Array.from(m.slice(0, 16)).map(v => +v.toFixed(3));
        const second = Array.from(m.slice(16, 32)).map(v => +v.toFixed(3));
        out.inst.push({
          count: o.count, geo: o.geometry.type,
          col: '#' + o.material.color.getHexString(),
          emis: o.material.emissive ? '#' + o.material.emissive.getHexString() : '-',
          ei: o.material.emissiveIntensity,
          visible: o.visible, frustum: o.frustumCulled,
          mat1: first, mat2: second
        });
      } else if (o.isMesh) {
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        out.meshes.push({ geo: o.geometry.type, col: '#' + o.material.color.getHexString(), min: [+bb.min.x.toFixed(1), +bb.min.y.toFixed(1), +bb.min.z.toFixed(1)], max: [+bb.max.x.toFixed(1), +bb.max.y.toFixed(1), +bb.max.z.toFixed(1)], side: o.material.side, tr: o.material.transparent });
      }
    });
    return out;
  });
  console.log('=== 鸟巢 InstancedMesh ===');
  console.log(JSON.stringify(r.inst, null, 1));
  console.log('=== 鸟巢普通 mesh ===');
  for (const m of r.meshes) console.log(JSON.stringify(m));
  await b.close();
})();
