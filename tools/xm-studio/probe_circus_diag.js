/* 马戏团诊断：
   1) 走钢丝的熊 armL/armR 是否真的可见、有没有 mesh、位置在哪
   2) 秋千熊（trap bear）与旗杆/柱子的实际距离 → 是否穿模
   3) 马戏团区域夜间的实际亮度
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e).slice(0,220)));
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  await pg.evaluate(()=>{const e=document.getElementById('mp-login'); if(e)e.style.display='none';});

  /* ── 1. 钢丝熊的手臂 ── */
  const arms = await pg.evaluate(() => {
    const V = window.diorama.scene().position.constructor;
    const c = window.diorama.circus();
    // 通过 updateCircus 用的引用拿不到 group，直接按特征找：
    // 钢丝熊 = 站姿高度 3.33 附近、且是 person group
    const res = [];
    window.diorama.scene().traverse(o => {
      if (!(o.isGroup && o.userData && o.userData.legL && o.userData.armL)) return;
      const p = new V(); o.getWorldPosition(p);
      if (Math.abs(p.y - 3.35) > 0.35) return;      // 只看钢丝上那只
      const dump = (g, nm) => {
        const wp = new V(); g.getWorldPosition(wp);
        let meshes = 0, verts = 0;
        g.traverse(m => { if (m.isMesh) { meshes++; verts += m.geometry.attributes.position.count; } });
        return { nm, pos:[+wp.x.toFixed(2),+wp.y.toFixed(2),+wp.z.toFixed(2)],
                 rotZ:+g.rotation.z.toFixed(3), rotX:+g.rotation.x.toFixed(3),
                 meshes, verts, visible:g.visible, parentVisible:g.parent.visible };
      };
      res.push({
        walker: [ +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2) ],
        armL: dump(o.userData.armL,'armL'),
        armR: dump(o.userData.armR,'armR'),
        legL: dump(o.userData.legL,'legL'),
        bodyMeshes: o.children.filter(x=>x.isMesh).length
      });
    });
    return res;
  });
  console.log('钢丝熊:', JSON.stringify(arms, null, 1));

  /* ── 2. 秋千熊 vs 旗杆 ── */
  const trap = await pg.evaluate(() => {
    const V = window.diorama.scene().position.constructor;
    const out = { samples: [] };
    const scene = window.diorama.scene();
    // 找 trap 组（position y=8.30 局部，父是马戏团组）
    let trapG = null;
    scene.traverse(o => {
      if (o.isGroup && Math.abs(o.position.y - 8.30) < 0.01 && Math.abs(o.position.x) < 0.01) trapG = o;
    });
    if (!trapG) return { trapRemoved: true, samples: [], minDistToAxis: null };
    out.trapChildren = trapG.children.map(c => {
      const p = new V(); c.getWorldPosition(p);
      return { type: c.type, isPerson: !!(c.userData && c.userData.legL), pos:[+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)] };
    });
    // 采样 20 帧：trap 熊与「旗杆中心线」的水平距离
    return new Promise(res => {
      const rec = [];
      let n = 0;
      const tick = () => {
        const p = new V();
        let bearP = null;
        trapG.traverse(o => { if (o.isGroup && o.userData && o.userData.legL) { o.getWorldPosition(p); bearP = [+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)]; } });
        if (bearP) rec.push({ bear: bearP, trapRotZ: +trapG.rotation.z.toFixed(3), trapRotX: +trapG.rotation.x.toFixed(3) });
        if (++n < 24) requestAnimationFrame(tick);
        else {
          out.samples = rec;
          // 旗杆在马戏团中心 (50,30)，熊到中心轴的水平距离
          const ds = rec.map(r => Math.hypot(r.bear[0]-50, r.bear[2]-30));
          out.minDistToAxis = +Math.min(...ds).toFixed(3);
          out.maxDistToAxis = +Math.max(...ds).toFixed(3);
          res(out);
        }
      };
      requestAnimationFrame(tick);
    });
  });
  console.log('秋千:', JSON.stringify(trap, null, 1));

  /* ── 3. 马戏团夜间亮度 ── */
  await pg.evaluate(() => {
    const el = document.getElementById('hour'); el.value = '21.5'; el.dispatchEvent(new Event('input'));
    window.MP.freezeCam(50, 4.5, 22, 50, 2.5, 30);
  });
  await pg.waitForTimeout(1800);
  await pg.screenshot({ path: '/tmp/cu_night.png' });
  // 帐篷内地面取样亮度
  const bright = await pg.evaluate(() => new Promise(res => {
    const cv = document.querySelector('canvas');
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const x = c2.getContext('2d'); x.drawImage(cv, 0, 0);
    // 取帐篷中央区域（画面中下部）
    const W = cv.width, H = cv.height;
    let sum = 0, n = 0, mx = 0;
    for (let py = Math.floor(H*0.55); py < H*0.85; py += 4) for (let px = Math.floor(W*0.35); px < W*0.65; px += 4) {
      const d = x.getImageData(px, py, 1, 1).data;
      const l = .299*d[0]+.587*d[1]+.114*d[2];
      sum += l; n++; if (l > mx) mx = l;
    }
    res({ avg: +(sum/n).toFixed(1), max: +mx.toFixed(1), n });
  }));
  console.log('帐篷内亮度:', JSON.stringify(bright));

  console.log(errs.length?'ERR '+errs.join('|'):'no page errors');
  await b.close();
})();
