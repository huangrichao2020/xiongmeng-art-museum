/* 马戏团三项修复验证：
   1) 高处两个小熊（走钢丝 walker / 吊环 acroBear）躯干是否跟着手脚一起动
   2) 射灯/扫光/追光斑是否全部没了
   3) 空气墙是否消失（fpFloorAt 走到马戏团中心）
   4) 礼帽/兔子/苹果/彩球是否还在动（合批烘死会导致它们不动）
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + String(e).slice(0, 220)));
  pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + String(m.text()).slice(0, 220)); });
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  /* ── 1. 躯干跟不跟手？ ──
     判据：躯干 mesh 的世界坐标 == 该人物 group 的世界坐标（局部 y≈0.48 躯干中心）
     且连续两次采样，躯干世界坐标的变化量 ≈ group 位置变化量。 */
  const bearProbe = () => pg.evaluate(() => {
    const T = window.THREE_NS || null;
    const out = {};
    const c = window.diorama.circus();
    const dump = (name, p) => {
      if (!p) { out[name] = null; return; }
      // 躯干 mesh = 人物 group 下第一个非 keep 的 mesh（makePerson 内部合批产物）
      let body = null;
      p.traverse(o => { if (!body && o.isMesh && !o.userData.keep) body = o; });
      const gv = { x: 0, y: 0, z: 0 }, bv = { x: 0, y: 0, z: 0 };
      const v = new (p.position.constructor)();
      p.getWorldPosition(v); gv.x = +v.x.toFixed(3); gv.y = +v.y.toFixed(3); gv.z = +v.z.toFixed(3);
      if (body) { body.getWorldPosition(v); bv.x = +v.x.toFixed(3); bv.y = +v.y.toFixed(3); bv.z = +v.z.toFixed(3); }
      out[name] = { grp: gv, body: bv, hasBody: !!body };
    };
    const A = window.diorama._circusRefs ? window.diorama._circusRefs() : null;
    return { c, A };
  });
  console.log('NOTE diorama._circusRefs 未导出时无法直接取 group，改为在页面内遍历场景找');

  /* 直接在页面里按 name 找：给人物 group 起名字以便定位 */
  await pg.evaluate(() => {
    const scene = window.diorama.scene();
    scene.traverse(o => {
      if (o.isGroup && o.userData && o.userData.legL && o.userData.armL) {
        // 用特征定位：钢丝熊在 station 315°，吊环熊在 trap 里
        o.userData._probePerson = true;
      }
    });
  });

  const sample = () => pg.evaluate(() => {
    const scene = window.diorama.scene();
    const res = [];
    scene.traverse(o => {
      if (!(o.isGroup && o.userData && o.userData.legL && o.userData.armL)) return;
      let body = null;
      o.traverse(c => { if (!body && c.isMesh && !c.userData.keep) body = c; });
      if (!body) return;
      const gp = new o.position.constructor(), bp = new o.position.constructor();
      o.getWorldPosition(gp); body.getWorldPosition(bp);
      res.push({
        grp: [+gp.x.toFixed(2), +gp.y.toFixed(2), +gp.z.toFixed(2)],
        body: [+bp.x.toFixed(2), +bp.y.toFixed(2), +bp.z.toFixed(2)],
        gap: +gp.distanceTo(bp).toFixed(3)
      });
    });
    return res;
  });

  const s1 = await sample();
  await pg.waitForTimeout(2500);
  const s2 = await sample();
  console.log('人物数 =', s2.length);
  console.log('样本1', JSON.stringify(s1));
  console.log('样本2', JSON.stringify(s2));
  let bad = 0, moving = 0;
  for (let i = 0; i < s2.length; i++) {
    const a = s1[i], b = s2[i];
    if (!a || !b) continue;
    if (b.gap > 0.35) bad++;
    const d = Math.hypot(b.grp[0] - a.grp[0], b.grp[1] - a.grp[1], b.grp[2] - a.grp[2]);
    const bd = Math.hypot(b.body[0] - a.body[0], b.body[1] - a.body[1], b.body[2] - a.body[2]);
    if (d > 0.05) { moving++; console.log(`  #${i} 动起来: groupΔ=${d.toFixed(3)} bodyΔ=${bd.toFixed(3)} gap=${b.gap}`); }
  }
  console.log('躯干与身体脱节(gap>0.35)的个数 =', bad, '/', s2.length);
  console.log('位移中的角色数 =', moving);

  /* ── 2. 射灯检查 ── */
  const lights = await pg.evaluate(() => {
    const out = { spot: 0, points: 0, others: 0, sweepMeshes: 0 };
    window.diorama.scene().traverse(o => {
      if (o.isSpotLight) out.spot++;
      else if (o.isPointLight) out.points++;
      else if (o.isLight) out.others++;
      if (o.isMesh && o.material && o.material.blending === 2 && o.geometry && o.geometry.type === 'RingGeometry') out.sweepMeshes++;
    });
    return out;
  });
  console.log('全场灯光:', JSON.stringify(lights));
  const cst = await pg.evaluate(() => window.diorama.circus());
  console.log('circus 状态 sweepY=', cst.sweepY, ' spotOn=', cst.spotOn, ' act=', cst.actCn);

  /* ── 3. 空气墙 ── */
  const wall = await pg.evaluate(() => {
    const out = {};
    // 马戏团中心 (50,30)、入口西侧 (44,30)、帐篷中心
    out.center = window.MP && window.diorama.floorAt ? null : null;
    return out;
  });
  // 用第一人称实际走进去测试
  const fpTest = await pg.evaluate(() => {
    const r = [];
    const pts = [[50, 30], [44, 30], [56, 30], [50, 24], [50, 36], [39.5, 30], [62, 30], [41, 21], [59, 39]];
    for (const [x, z] of pts) {
      const v = window.diorama.floorAt(x, z);
      r.push([x, z, v.ok ? 'ok' : 'BLOCK']);
    }
    return r;
  });
  console.log('地面通行:', JSON.stringify(fpTest));

  /* ── 4. 道具是否还在动 ── */
  const anim = async () => pg.evaluate(() => window.diorama.circus());
  const a1 = await anim(); await pg.waitForTimeout(2600); const a2 = await anim();
  console.log('道具1', JSON.stringify({ hatY: a1.hatY, apple0: a1.apple0, ball0: a1.ball0, walkerX: a1.walkerX, trapZ: a1.trapZ }));
  console.log('道具2', JSON.stringify({ hatY: a2.hatY, apple0: a2.apple0, ball0: a2.ball0, walkerX: a2.walkerX, trapZ: a2.trapZ }));

  /* ── 5. 夜景截图（看还有没有奇怪的光） ── */
  await pg.evaluate(() => {
    const el = document.getElementById('hour'); el.value = '21.5'; el.dispatchEvent(new Event('input'));
    window.MP.freezeCam(44.0, 3.2, 26.0, 50.5, 3.0, 30.0);
  });
  await pg.waitForTimeout(1600);
  await pg.screenshot({ path: '/tmp/cf_night.png' });
  await pg.evaluate(() => window.MP.freezeCam(50.0, 6.0, 14.0, 50, 3.6, 30));
  await pg.waitForTimeout(1400);
  await pg.screenshot({ path: '/tmp/cf_night2.png' });
  await pg.evaluate(() => window.MP.freezeCam(47.0, 4.4, 25.0, 53.0, 3.4, 27.2));
  await pg.waitForTimeout(1400);
  await pg.screenshot({ path: '/tmp/cf_wire.png' });

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
