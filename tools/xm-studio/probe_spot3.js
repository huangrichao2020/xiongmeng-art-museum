/* 后场落点扫描：找出既不挨铁路轨道、又没高物体（树/建筑）的地方 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/index.html', { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.__OK, { timeout: 90000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(() => {
    const T = window.__THREE, scene = window.__SCENE;
    // 铁路曲线（与页面一致）
    const rail = new T.CatmullRomCurve3([
      new T.Vector3(-69.5,0,-32), new T.Vector3(0,0,-35), new T.Vector3(69.5,0,-32),
      new T.Vector3(69.5,0,-2), new T.Vector3(69.5,0,34), new T.Vector3(64,0,62),
      new T.Vector3(4,0,64), new T.Vector3(-64,0,62), new T.Vector3(-69.5,0,34),
      new T.Vector3(-69.5,0,-2)
    ], true, 'catmullrom', .20);
    const railPts = rail.getSpacedPoints(600);

    // 收集所有高物体（世界高度 > 5m）的中心与半径
    const tall = [];
    const box = new T.Box3(), v = new T.Vector3();
    scene.traverse(o => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (!o.geometry) return;
      o.updateWorldMatrix(true, false);
      box.setFromObject(o);
      if (!isFinite(box.min.y) || box.max.y < 5) return;
      const h = box.max.y - box.min.y;
      if (h < 5) return;
      box.getCenter(v);
      const rXZ = Math.max(box.max.x-box.min.x, box.max.z-box.min.z)/2;
      if (rXZ > 40) return;          // 天空盒/地面/大特效，不算障碍
      tall.push({ x:+v.x.toFixed(1), z:+v.z.toFixed(1), top:+box.max.y.toFixed(1), r:+rXZ.toFixed(1) });
    });

    // 地面范围
    let gx = 0, gz = 0;
    scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry') {
      const b2 = new T.Box3().setFromObject(o); gx = Math.max(gx, b2.max.x); gz = Math.max(gz, b2.max.z);
    }});

    function railDist(x, z) {
      let m = 1e9;
      for (const p of railPts) { const d = Math.hypot(p.x-x, p.z-z); if (d < m) m = d; }
      return m;
    }
    function tallDist(x, z) {
      let m = 1e9, who = null;
      for (const t of tall) { const d = Math.hypot(t.x-x, t.z-z) - t.r; if (d < m) { m = d; who = t; } }
      return { d:m, who };
    }
    const cands = [];
    for (let x = -66; x <= 66; x += 2) {
      for (let z = 40; z <= 76; z += 2) {
        const rd = railDist(x, z), td = tallDist(x, z);
        cands.push({ x, z, rail:+rd.toFixed(1), tall:+td.d.toFixed(1), who:td.who });
      }
    }
    // 要求：离轨道 >= 11m（伞半径 5.9 + 火车安全距），离高物体 >= 7.5m
    // 按「离轨道远 + 离高物远」排序，取 z 在 30..72 的所有合格点（限制在场景后场主体范围内）
    const ok = cands.filter(c => c.rail >= 9 && c.tall >= 6.5);
    ok.sort((a,b) => (b.tall*1.2 + b.rail) - (a.tall*1.2 + a.rail));
    const inMain = ok.filter(c => c.z <= 72);
    return { gx, gz, tallCount: tall.length,
      tallSample: tall.filter(t=>t.top>15 && t.r<12).slice(0,14),
      ok: inMain.slice(0,16), corner: ok.filter(c=>c.z>72).slice(0,8) };
  });
  console.log('地面范围 ±%s / ±%s   高物体数 %s', r.gx, r.gz, r.tallCount);
  console.log('高树(>15m):', JSON.stringify(r.tallSample));
  console.log('候选落点(x,z,离轨道,离高物):');
  console.log('  [后场主体 z<=72]');
  for (const c of r.ok) console.log('  ', c.x, c.z, 'rail', c.rail, 'tall', c.tall, c.who?`(${c.who.x},${c.who.z},top${c.who.top})`:'');
  console.log('  [角落 z>72]');
  for (const c of r.corner) console.log('  ', c.x, c.z, 'rail', c.rail, 'tall', c.tall);
  await b.close();
})();
