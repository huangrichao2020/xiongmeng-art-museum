/* 碰撞表体检：OUTDOOR_OBS 里每个圆，正上方到底有没有东西？
   ─────────────────────────────────────────────────────────
   几何挪了位、碰撞表没跟着改，就会出现两种怪事：
     · 玩家撞空气（碰撞点下面什么都没有）
     · 玩家穿过实物（东西挪走了，碰撞点还留在原地）

   判别方法：从每个碰撞点正上方 y=14 往下打一条射线，
   看第一下打到的表面离地多高。高度≈0 就说明这一格是空的。

   用法： node probe_obs_audit.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR && window.XM_TOUR.OUTDOOR_OBS, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
  });

  const rows = await pg.evaluate(() => {
    const T = window.XM_TOUR, THREE = T.THREE;
    const rc = new THREE.Raycaster();
    rc.far = 40;
    rc.camera = T.camera;   // Sprite 的 raycast 需要相机，否则直接抛异常
    const out = [];
    T.OUTDOOR_OBS.forEach((e, i) => {
      const [x, z, r] = e;
      rc.set(new THREE.Vector3(x, 14, z), new THREE.Vector3(0, -1, 0));
      const hit = rc.intersectObjects(T.scene.children, true).filter(h => h.distance > 0.01);
      const h = hit.length ? hit[0] : null;
      const m = h && h.object.material ? h.object.material : null;
      out.push({
        i, x: +x.toFixed(2), z: +z.toFixed(2), r: +r.toFixed(2),
        y: h ? +(14 - h.distance).toFixed(2) : -1,
        c: m && m.color ? '#' + m.color.getHexString() : '?',
        geo: h ? h.object.geometry.type : 'none',
        n: h ? (hit.length) : 0
      });
    });
    return out;
  });

  console.log('idx     x       z      r     正上方高度  颜色      几何            判定');
  const bad = [];
  for (const r of rows) {
    const empty = r.y < 0.45;
    const v = empty ? '✗ 底下是空的（撞空气）' : (r.y < 1.2 ? '△ 只有很矮的东西' : '✓');
    if (empty) bad.push(r);
    console.log(`${String(r.i).padStart(3)}  ${String(r.x).padStart(7)} ${String(r.z).padStart(7)} ${String(r.r).padStart(5)}  ` +
      `${String(r.y).padStart(7)}   ${r.c.padEnd(9)} ${r.geo.padEnd(14)} ${v}`);
  }
  console.log(`\n共 ${rows.length} 个碰撞点，其中 ${bad.length} 个底下是空的`);
  if (bad.length) {
    console.log('空的碰撞点（几何挪走但碰撞没挪）：');
    for (const r of bad) console.log(`  x=${r.x}  z=${r.z}  r=${r.r}`);
  }
  await b.close();
})();
