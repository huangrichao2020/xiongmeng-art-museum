/* 点光源实测：当前真正参与渲染的灯有多少？灯数 → 帧率是什么关系？
   ─────────────────────────────────────────────────────────
   用法： node probe_lightcount.js
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(12000);
  await pg.evaluate(() => {
    document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e => { e.style.display = 'none'; });
    if (window.__fp) window.__fp.on = false;
  });

  const list = await pg.evaluate(() => {
    const T = window.XM_TOUR;
    const out = [];
    T.scene.traverse(o => {
      if (!o.isPointLight) return;
      const wp = new T.THREE.Vector3(); o.getWorldPosition(wp);
      out.push({
        vis: o.visible, slot: !!o.userData.lpSlot, fixed: !!o.userData.lpFixed,
        cand: !!o.parent && o.parent === T.scene && Math.hypot(o.position.x, o.position.z) < 20,
        p: [+wp.x.toFixed(1), +wp.y.toFixed(1), +wp.z.toFixed(1)],
        lp: [+o.position.x.toFixed(1), +o.position.y.toFixed(1), +o.position.z.toFixed(1)],
        inScene: o.parent === T.scene,
        par: o.parent ? (o.parent.userData && o.parent.userData.tag) || o.parent.name || o.parent.type : '?',
        i: +o.intensity.toFixed(1), d: o.distance
      });
    });
    return {
      all: out,
      nVisible: out.filter(o => o.vis).length,
      nTotal: out.length,
      nSlot: out.filter(o => o.slot).length,
      nFixed: out.filter(o => o.fixed).length,
      nCandVisible: out.filter(o => o.vis && !o.slot).length
    };
  });

  console.log(`点光源总数 ${list.nTotal}｜参与渲染 ${list.nVisible}（槽位 ${list.nSlot} 个，槽位外常驻 ${list.nCandVisible} 个）`);
  console.log('\n参与渲染的灯：');
  for (const l of list.all.filter(o => o.vis)) {
    console.log(`  ${l.slot ? '槽位' : (l.fixed ? 'lp常驻' : '非槽位')}  世界(${l.p.join(', ')})  局部(${l.lp.join(', ')})  直挂场景=${l.inScene}  父=${l.par}  强度 ${String(l.i).padStart(6)}  半径 ${l.d}`);
  }
  console.log('\n没进渲染的候选灯（前 10，只看位置）：');
  for (const l of list.all.filter(o => !o.vis).slice(0, 10)) console.log(`  位置(${l.p.join(', ')})  半径 ${l.d}`);

  const measure = async (label) => {
    const r = await pg.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 < 2600) requestAnimationFrame(tick);
        else {
          let vis = 0;
          window.XM_TOUR.scene.traverse(o => { if (o.isPointLight && o.visible) vis++; });
          res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), vis });
        }
      };
      requestAnimationFrame(tick);
    }));
    console.log(`  ${label.padEnd(22)} ${String(r.fps).padStart(5)} fps   参与渲染的点光源 ${r.vis}`);
    return r;
  };

  for (const [name, cam] of [['正门广场', [0, 2.2, 2, 0, 3.2, 8]], ['市集西列', [-30, 2.0, -4, -36, 1.6, -12]]]) {
    console.log(`\n=== ${name} ===`);
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), cam);
    await pg.waitForTimeout(1500);
    await measure('现状');
    await pg.evaluate(() => {
      window.__keep = [];
      window.XM_TOUR.scene.traverse(o => { if (o.isPointLight && o.visible && !o.userData.lpSlot) { o.visible = false; window.__keep.push(o); } });
    });
    await pg.waitForTimeout(1800);
    await measure('只留槽位灯');
    await pg.evaluate(() => {
      window.XM_TOUR.scene.traverse(o => { if (o.isPointLight && o.userData.lpSlot) o.visible = false; });
    });
    await pg.waitForTimeout(1800);
    await measure('一个点光源都不留');
    await pg.evaluate(() => {
      window.XM_TOUR.scene.traverse(o => { if (o.isPointLight) o.visible = true; });
    });
    await pg.waitForTimeout(1200);
  }

  await b.close();
})();
