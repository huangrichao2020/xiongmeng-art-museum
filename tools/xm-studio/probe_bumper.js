/* 碰碰车驾驶逻辑量化体检（无头 Chromium，跑真页面脚本）
   用法: node probe_bumper.js [url]
   覆盖：上车藏驾驶员 / 油门加速 / 转向方向 / 撞围栏 / 撞车互弹 / 相机位姿 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
  p.on('console', m => { if (m.type()==='error') console.log('[console.error]', m.text().slice(0,300)); });
  await p.goto(SITE, { waitUntil:'load', timeout:90000 });
  await p.waitForFunction(() => window.__PROBE && window.__PROBE.amusement, { timeout:90000 });
  await p.waitForTimeout(2000);

  const out = await p.evaluate(async () => {
    const P = window.__PROBE;
    const car = P.amusement.bumper[0];
    const press = (code, down) => window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
    const frames = n => new Promise(r => { let i=0; const tick=()=>{ if(++i>=n) return r(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    const snap = () => ({
      x:+car.position.x.toFixed(2), z:+car.position.z.toFixed(2),
      rot:+car.rotation.y.toFixed(3),
      spd:+(P.wheelSys.bump ? P.wheelSys.bump.speed : 0).toFixed(2),
      drv:car.userData.driver.visible,
      camY:+P.camera.position.y.toFixed(2),
      camYaw:+P.camera.rotation.y.toFixed(3),
      camX:+P.camera.position.x.toFixed(2), camZ:+P.camera.position.z.toFixed(2)
    });
    const R = {};

    /* ── 1. 上车：驾驶员应消失 ── */
    P.toggleRideFacility({kind:'bumper', car, label:'冰面碰碰车'});
    await frames(4);
    R.board = { ...snap(), riding:P.wheelSys.riding, kind:P.wheelSys.kind,
                hud:(document.getElementById('train-msg')||{}).textContent||'' };

    /* ── 2. 直线加速 2.5s ── */
    const a0 = snap();
    press('KeyW', true);
    await frames(150);
    const a1 = snap();
    press('KeyW', false);
    await frames(40);
    const a2 = snap();
    R.accel = { from:a0, at2_5s:a1, coast:a2,
      dist:+Math.hypot(a1.x-a0.x, a1.z-a0.z).toFixed(2),
      coastDist:+Math.hypot(a2.x-a1.x, a2.z-a1.z).toFixed(2) };

    /* ── 3. 转向：W+D 1.5s，应向右偏（右 = f×up = (-cosθ, sinθ)） ── */
    const t0 = snap();
    press('KeyW', true); press('KeyD', true);
    await frames(90);
    press('KeyD', false); press('KeyW', false);
    await frames(30);
    const t1 = snap();
    const rx = -Math.cos(t0.rot), rz = Math.sin(t0.rot);
    R.turn = { dRot:+(t1.rot-t0.rot).toFixed(3),
      rightComp:+((t1.x-t0.x)*rx + (t1.z-t0.z)*rz).toFixed(2),
      dx:+(t1.x-t0.x).toFixed(2), dz:+(t1.z-t0.z).toFixed(2) };

    /* ── 4. 撞围栏：放到东墙边全速冲 ── */
    car.position.set(10.5, .12, 0);
    P.wheelSys.bump.ang = Math.PI/2;           // 车头朝 +X（东墙）
    P.wheelSys.bump.vx = 0; P.wheelSys.bump.vz = 0;
    await frames(2);
    press('KeyW', true);
    await frames(140);
    press('KeyW', false);
    const w = snap();
    R.wall = { ...w, withinX: Math.abs(w.x) <= 11.2, withinZ: Math.abs(w.z) <= 7.2 };

    /* ── 5. 撞另一辆车：应互相弹开，并把对方撞出轨道 ──
       NPC 车的位置每帧由椭圆轨道覆盖，所以先把它的轨道半径缩成 0 当靶子 */
    const npc = P.amusement.bumper[1];
    const ost = npc.userData.st;
    const save = {rx:ost.rx, rz:ost.rz, spd:ost.spd, ang:ost.ang};
    ost.rx = .001; ost.rz = .001; ost.spd = 0; ost.ang = 0;
    ost.kx = 0; ost.kz = 0;
    await frames(3);
    const npcHome = {x:+npc.position.x.toFixed(3), z:+npc.position.z.toFixed(3)};
    car.position.set(-3.2,.12,0);
    P.wheelSys.bump.ang = Math.PI/2; P.wheelSys.bump.vx=0; P.wheelSys.bump.vz=0;
    await frames(2);
    const trace = [];
    press('KeyW', true);
    for (let i=0;i<100;i++){
      await frames(1);
      trace.push({x:+car.position.x.toFixed(2), spd:+(P.wheelSys.bump.speed||0).toFixed(2),
                  kx:+(ost.kx||0).toFixed(2), kz:+(ost.kz||0).toFixed(2),
                  d:+Math.hypot(car.position.x-npc.position.x, car.position.z-npc.position.z).toFixed(2)});
    }
    press('KeyW', false);
    const c = snap();
    const spdBefore = Math.max(...trace.map(r=>r.spd));
    R.carHit = {
      npcHome,
      minDist:+Math.min(...trace.map(r=>r.d)).toFixed(2),
      spdBefore:+spdBefore.toFixed(2),
      spdAfter:+c.spd.toFixed(2),
      maxNpcKick:+Math.max(...trace.map(r=>Math.hypot(r.kx,r.kz))).toFixed(2),
      playerEnd:{x:c.x,z:c.z}
    };

    /* ── 6. 下车：驾驶员应回来 ── */
    P.stopFacilityRide();
    await frames(4);
    R.exit = { driverBack: car.userData.driver.visible, riding:P.wheelSys.riding,
               fp:[+P.fp.x.toFixed(2), +P.fp.z.toFixed(2)] };

    return R;
  });

  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
