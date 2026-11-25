/* 鸟巢验证：量真实尺寸 + 多角度截图（白天/夜晚） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const accs = pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 240)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(10000);
  /* 隐藏登录遮罩（本地预览没有后端，连不上也不影响看场景） */
  await pg.evaluate(() => {
    for(const id of ['mp-login','mp-mask','mp-panel','mp-overlay']){
      const e=document.getElementById(id); if(e){e.style.display='none';}
    }
    document.querySelectorAll('.mp-login,.login-mask,#mp-login *').forEach(e=>{e.style.display='none';});
  });
  await pg.waitForTimeout(1500);

  /* ── 量尺寸 ── */
  const m = await pg.evaluate(() => {
    const sc = window.diorama.scene();
    let nest = null;
    sc.traverse(o => { if (o.userData && o.userData.tag === 'nest' && !nest) nest = o; });
    if (!nest) return { err: '找不到 nest 组' };
    nest.updateMatrixWorld(true);
    const bb = new (Object.getPrototypeOf(nest).constructor === Object ? Object : Object)();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
    let meshes = 0, inst = 0, instTotal = 0, tris = 0;
    nest.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      if (o.isInstancedMesh) { inst++; instTotal += o.count; }
      const g = o.geometry; if (!g || !g.attributes.position) return;
      const idx = g.index ? g.index.count : g.attributes.position.count;
      tris += idx / 3 * (o.isInstancedMesh ? o.count : 1);
      if (!g.boundingBox) g.computeBoundingBox();
      const bb2 = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
      minX = Math.min(minX, bb2.min.x); maxX = Math.max(maxX, bb2.max.x);
      minY = Math.min(minY, bb2.min.y); maxY = Math.max(maxY, bb2.max.y);
      minZ = Math.min(minZ, bb2.min.z); maxZ = Math.max(maxZ, bb2.max.z);
    });
    /* 钢梁 InstancedMesh 明细 */
    const rods = [];
    nest.traverse(o => {
      if (o.isInstancedMesh) rods.push({ count: o.count, geo: o.geometry.type, mat: '#' + o.material.color.getHexString() });
    });
    return {
      pos: [nest.position.x, nest.position.y, nest.position.z],
      spanX: +(maxX - minX).toFixed(1), spanZ: +(maxZ - minZ).toFixed(1), spanY: +(maxY - minY).toFixed(1),
      minY: +minY.toFixed(2), maxY: +maxY.toFixed(2),
      x: [+minX.toFixed(1), +maxX.toFixed(1)], z: [+minZ.toFixed(1), +maxZ.toFixed(1)],
      meshes, inst, instTotal, tris: Math.round(tris), rods
    };
  });
  console.log('鸟巢组:', JSON.stringify(m, null, 1));

  const shot = async (hour, cam, tag) => {
    await pg.evaluate(h => { const el = document.getElementById('hour'); el.value = String(h); el.dispatchEvent(new Event('input')); }, hour);
    await pg.waitForTimeout(1900);
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1500);
    await pg.screenshot({ path: '/tmp/nb_' + tag + '.png' });
    console.log('拍到', tag);
  };
  await shot(13, [66, 30, -36, 0, 11, -100], 'day_far');
  await shot(13, [14, 3.6, -84, -10, 16, -114], 'day_inside');
  await shot(13, [0, 150, -100, 0, 0, -101], 'day_top');
  await shot(13, [0, 5, -42, 0, 13, -100], 'day_gate');
  await shot(21.5, [66, 30, -36, 0, 11, -100], 'night_far');
  await shot(21.5, [14, 3.6, -84, -10, 16, -114], 'night_inside');
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
