/* 骑乘体检：坐摩天轮 / 云霄飞车时，相机到底晃不晃、会不会穿模、轨道挡不挡视线
   ─────────────────────────────────────────────────────────
   灵感来自 Opus 5.6 案例库（RezAIT00/agent-demos）的做法：
   「相机穿模检查 —— 60Hz 扫全片，相机不得在任何一帧落进几何体内部」。
   那套是给影片做的，我们这边同样适用：宣传片和玩家实际乘坐走的是同一条乘坐逻辑。

   以前判断「坐上去晃不晃 / 轨道挡不挡视线」全靠人肉看片，
   改一版就要重录重看。这脚本把它变成可重复的量：
     · 相机角速度（deg/s）逐帧算 —— 找抖动尖峰，而不是看平均速度
     · 相机是否落在几何体内部 —— 往 8 个方向打射线，全都很近 = 穿模
     · 正前方遮挡距离 —— 轨道/支架横在眼前会直接体现成很小的值
     · 相机到地面的高度 —— 掉到 0 就说明"轮子转完人掉地上了"

   用法：
     node probe_ride_qc.js --ride wheel
     node probe_ride_qc.js --ride coaster
     node probe_ride_qc.js --ride all
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');

const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
const args = process.argv.slice(2);
/* 注意：这里必须写 return。写成 { const i=...; i>=0 ? args[i+1] : d; }
   的话整个块只是执行了一条语句，函数返回 undefined，
   参数永远取不到默认值（probe_wheel_path.js 里就踩过这个坑）。 */
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RIDE = getArg('--ride', 'all');
const SECONDS = parseFloat(getArg('--sec', '16'));

/* 判定阈值 —— 超过就报出来，让人决定要不要改 */
const TH = {
  jitter: 45,      // deg/s 逐帧突变（角加速度尖峰）
  spin: 70,        // deg/s 持续角速度（甩过头）
  inside: 0.45,    // 8 方向里最远的命中距离仍 < 0.45m = 相机卡进几何体
  block: 2.2,      // 正前方 2.2m 内有东西 = 视线被挡
};

(async () => {
  const b = await chromium.launch({
    executablePath: EXE, headless: true,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu',
      '--autoplay-policy=no-user-gesture-required']
  });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(14000);
  await pg.evaluate(() => {
    /* 注意：这里必须用 querySelectorAll，不能用 document.getElementBy ——
       本机 playwright 的 chromium 构建（145/148/156 三个版本都是）
       的 document 上没有 getElementBy 这个方法，调用会直接抛
       "document.getElementBy is not a function"。 */
    document.querySelectorAll('#mp-login,#mp-mask,#mp-panel,#mp-overlay,#boot')
      .forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
    if (window.MP && window.MP.exitWalk) window.MP.exitWalk();
    window.XM_TOUR.stopDirector();
  });
  await pg.waitForTimeout(1500);

  async function ride(kind) {
    console.log(`\n════════ ${kind === 'wheel' ? '摩天轮' : '云霄飞车'} ════════`);
    const started = await pg.evaluate((k) => {
      const T = window.XM_TOUR;
      const THREE = T.THREE;
      const rc = new THREE.Raycaster();
      const dirs = [];
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        dirs.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
      }
      /* 先把可射线命中的物体收好：合批后的某些 mesh 的 matrixWorld 可能是 null，
         直接丢进 intersectObjects 会抛 "reading 'matrixWorld'"，整条采样链就断了。 */
      const targets = [];
      T.scene.traverse(o => {
        if (o && o.isMesh && o.geometry && o.matrixWorld && !Array.isArray(o.material)) targets.push(o);
      });
      /* 命中对象的身份：往父级找名字，再带材质颜色和包围盒大小 */
      const describe = (o) => {
        let q = o, chain = [];
        for (let i = 0; i < 5 && q; i++) { chain.push(q.name || q.type); q = q.parent; }
        const m = o.material;
        const col = m && m.color ? '#' + m.color.getHexString() : '?';
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const s = o.geometry.boundingBox.getSize(new THREE.Vector3());
        return chain.join('<') + ' ' + col + ' 尺寸' + [s.x, s.y, s.z].map(v => v.toFixed(1)).join('x');
      };
      window.__RIDE = { rows: [], on: true, err: null, nTargets: targets.length };
      const cam = T.camera;
      const tick = () => {
        if (!window.__RIDE.on) return;
        requestAnimationFrame(tick);
        try {
          const p = cam.position;
          const dists = dirs.map(d => {
            const v = d.clone().applyQuaternion(cam.quaternion);
            rc.set(p, v); rc.far = 60;
            const hit = rc.intersectObjects(targets, false);
            return hit.length ? +hit[0].distance.toFixed(3) : 60;
          });
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
          rc.set(p, fwd); rc.far = 120;
          const fh = rc.intersectObjects(targets, false);
          /* 水平面前方：只看水平方向，地面/顶棚不会误判成"挡住视线" */
          const flat = new THREE.Vector3(fwd.x, 0, fwd.z);
          const flatLen = flat.length();
          let fwdH = 999, fwdHChain = '';
          if (flatLen > 0.01) {
            flat.normalize();
            rc.set(p, flat); rc.far = 120;
            const hh = rc.intersectObjects(targets, false);
            if (hh.length) { fwdH = +hh[0].distance.toFixed(3); fwdHChain = describe(hh[0].object); }
          }
          const t = performance.now();
          const prev = window.__RIDE.rows[window.__RIDE.rows.length - 1];
          let spin = 0;
          if (prev) {
            const q1 = cam.quaternion, q2 = prev.q;
            const d = Math.abs(q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w);
            spin = +(2 * Math.acos(Math.min(1, d)) * 180 / Math.PI * 1000 / Math.max(1, t - prev.t)).toFixed(2);
          }
          window.__RIDE.rows.push({
            t: +((t - window.__RIDE.t0) / 1000).toFixed(3),
            p: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)],
            q: { x: cam.quaternion.x, y: cam.quaternion.y, z: cam.quaternion.z, w: cam.quaternion.w },
            spin, dists,
            fwd: fh.length ? +fh[0].distance.toFixed(3) : 999,
            fwdTag: fh.length ? describe(fh[0].object) : '',
            fwdH, fwdHChain
          });
        } catch (e) {
          if (!window.__RIDE.err) window.__RIDE.err = String(e && e.message || e);
        }
      };
      window.__RIDE.t0 = performance.now();
      requestAnimationFrame(tick);
      const r = k === 'wheel' ? T.rideWheel('ascend') : T.rideCoaster();
      return { ok: !(r && r.ok === false), error: r && r.error };
    }, kind);
    if (!started.ok) { console.log('  起乘失败：', started.error); return; }

    await pg.waitForTimeout(SECONDS * 1000);
    const rows = await pg.evaluate(() => { window.__RIDE.on = false; return window.__RIDE.rows; });
    await pg.evaluate(() => window.XM_TOUR.stopRide());
    await pg.waitForTimeout(800);

    if (!rows.length) { console.log('  没采到帧'); return; }
    const spins = rows.map(r => r.spin);
    const maxSpin = Math.max(...spins);
    const p95 = spins.slice().sort((a, b) => a - b)[Math.floor(spins.length * 0.95)];
    const minY = Math.min(...rows.map(r => r.p[1]));
    const maxY = Math.max(...rows.map(r => r.p[1]));
    const enclosed = rows.filter(r => Math.max(...r.dists) < TH.inside);
    const blocked = rows.filter(r => r.fwd < TH.block);
    const blockedH = rows.filter(r => r.fwdH < TH.block);

    console.log(`  采样 ${rows.length} 帧 / ${rows[rows.length - 1].t.toFixed(1)}s`);
    console.log(`  相机高度 ${minY.toFixed(2)} ~ ${maxY.toFixed(2)} m`);
    console.log(`  角速度  最大 ${maxSpin.toFixed(1)}°/s   p95 ${p95.toFixed(1)}°/s   阈值 ${TH.spin}`);
    const jitter = rows.filter(r => r.spin > TH.jitter);
    console.log(`  抖动尖峰(>${TH.jitter}°/s) ${jitter.length} 帧` +
      (jitter.length ? '  最早: ' + jitter.slice(0, 6).map(r => `${r.t}s(${r.spin.toFixed(0)}°/s)`).join(' ') : ''));
    console.log(`  疑似穿模(8 方向最远仍 <${TH.inside}m) ${enclosed.length} 帧` +
      (enclosed.length ? '  最早: ' + enclosed.slice(0, 5).map(r => `${r.t}s`).join(' ') : ''));
    console.log(`  视线被挡(正前方 <${TH.block}m) ${blocked.length} 帧` +
      (blocked.length ? '  最早: ' + blocked.slice(0, 5).map(r => `${r.t}s→${r.fwd}m`).join(' ') : ''));
    console.log(`  水平面被挡(<${TH.block}m) ${blockedH.length} 帧` +
      (blockedH.length ? '  最早: ' + blockedH.slice(0, 5).map(r => `${r.t}s→${r.fwdH}m`).join(' ') : ''));
    const tags = {};
    for (const r of blocked) tags[r.fwdTag] = (tags[r.fwdTag] || 0) + 1;
    for (const r of blockedH) tags[r.fwdHChain] = (tags[r.fwdHChain] || 0) + 1;
    if (Object.keys(tags).length) {
      console.log('  挡在前面的物件:');
      for (const [k, v] of Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
        console.log(`    ${String(v).padStart(4)} 帧  ${k}`);
      }
    }

    /* 每秒一行摘要，方便对着录像看 */
    console.log('\n  t     相机位置             正前方距离');
    const buckets = {};
    for (const r of rows) { const s = Math.floor(r.t); (buckets[s] = buckets[s] || []).push(r); }
    for (const s of Object.keys(buckets)) {
      const g = buckets[s];
      const avg = g.reduce((a, r) => a + r.fwd, 0) / g.length;
      const mx = Math.max(...g.map(r => r.spin));
      console.log(`  ${String(s).padStart(3)}s  ${JSON.stringify(g[0].p).padEnd(20)} ${avg.toFixed(1)}m  角速度峰值 ${mx.toFixed(0)}°/s`);
    }
  }

  if (RIDE === 'wheel' || RIDE === 'all') await ride('wheel');
  if (RIDE === 'coaster' || RIDE === 'all') await ride('coaster');

  await b.close();
})();
