/* 本轮验收：角色尺寸/脚底、乘车一律第一人称、碰碰车撞击表现 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const ACC = pickAccounts(process.argv[2] || '');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.PURL || 'https://preview.ai10088.com/alex-garage/';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 200)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(4000);
  await pg.fill('#mp-acc', ACC.a); await pg.fill('#mp-pass', '123456');
  await pg.click('#mp-go');
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => MP.toggleThird());
  await pg.waitForTimeout(2000);

  /* ── 1. 角色尺寸 + 脚和身体是否连着 ── */
  const av = await pg.evaluate(() => {
    const g = MP.self;
    g.updateWorldMatrix(true, true);
    let minY = 1e9, maxY = -1e9, maxX = -1e9, minX = 1e9;
    const parts = [];
    g.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      minY = Math.min(minY, bb.min.y); maxY = Math.max(maxY, bb.max.y);
      minX = Math.min(minX, bb.min.x); maxX = Math.max(maxX, bb.max.x);
      parts.push({ n: o.geometry.type, y0: +bb.min.y.toFixed(3), y1: +bb.max.y.toFixed(3) });
    });
    /* 单独量身体蛋和鞋 */
    const rig = g.children.find(c => c.type === 'Group' && c.scale.x !== 1);
    const bodyGrp = g.userData.bodyGrp;
    let bodyBot = 1e9, shoeTop = -1e9, shoeBot = 1e9;
    bodyGrp.traverse(o => {
      if (!o.isMesh) return;
      if (o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius > .3) {
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        bodyBot = Math.min(bodyBot, bb.min.y);
      }
    });
    g.userData.feet.forEach(fg => fg.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      shoeTop = Math.max(shoeTop, bb.max.y); shoeBot = Math.min(shoeBot, bb.min.y);
    }));
    return {
      totalH: +(maxY - minY).toFixed(3), width: +(maxX - minX).toFixed(3),
      footY: +minY.toFixed(3), headY: +maxY.toFixed(3),
      bodyBottom: +bodyBot.toFixed(3), shoeTop: +shoeTop.toFixed(3), shoeBottom: +shoeBot.toFixed(3),
      gap: +(bodyBot - shoeTop).toFixed(3), rigScale: rig ? +rig.scale.x.toFixed(3) : null,
      tagY: +g.userData.tag.position.y.toFixed(3),
    };
  });
  console.log('[角色]', JSON.stringify(av));
  console.log('  脚底离地:', av.shoeBottom, ' 身体底-鞋顶 缝隙:', av.gap, av.gap <= 0.02 ? '✓ 连着' : '✗ 还有缝');

  /* 侧视图截图 */
  await pg.evaluate(() => {
    const g = MP.self, p = g.position;
    MP.freezeCam(p.x + 1.9, p.y + .78, p.z + .1, p.x, p.y + .70, p.z);
  });
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: '/tmp/mp_avatar_side.png' });

  /* ── 2. 乘车 → 一律第一人称 ── */
  const rideTest = await pg.evaluate(async () => {
    const before = MP.third;
    window.diorama.ride('bumper');
    await new Promise(r => setTimeout(r, 900));
    const during = { third: MP.third, selfVisible: MP.self ? MP.self.visible : null };
    window.diorama.ride('coaster');
    await new Promise(r => setTimeout(r, 600));
    const during2 = { third: MP.third, kind: window.diorama ? 1 : 0 };
    return { before, during, during2 };
  });
  console.log('[乘车视角]', JSON.stringify(rideTest));

  /* 下车恢复 */
  await pg.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); });
  await pg.waitForTimeout(800);
  const afterRide = await pg.evaluate(() => ({ third: MP.third, btn: MP._panel ? MP._panel.third.textContent : '' }));
  console.log('[下车后]', JSON.stringify(afterRide));

  /* ── 3. 碰碰车撞击：把目标车停住，玩家车对准它撞过去 ── */
  const bump = await pg.evaluate(async () => {
    const list = window.diorama.bumpers();
    const car = list[0];
    const other = list[1];
    other.userData.st.spd = 0;                 // 目标车先停住，方便撞
    const dx = other.position.x - car.position.x;
    const dz = other.position.z - car.position.z;
    const d = Math.hypot(dx, dz);
    car.rotation.y = Math.atan2(dx, dz);       // 车头对准目标
    const ride = window.diorama.ride('bumper');
    await new Promise(r => setTimeout(r, 200));
    /* 退到目标后方 3.2m，正对着冲 */
    car.position.set(other.position.x - dx / d * 3.2, .12, other.position.z - dz / d * 3.2);
    window.__B = { car, other };
    return { car: !!ride, others: list.length, d0: +d.toFixed(2) };
  });
  console.log('[碰碰车准备]', JSON.stringify(bump));

  /* 按 W 撞上去 */
  await pg.keyboard.down('KeyW');
  const samples = [];
  for (let i = 0; i < 26; i++) {
    await pg.waitForTimeout(110);
    const s = await pg.evaluate(() => {
      const { car, other } = window.__B;
      const st = car.userData.st, ost = other.userData.st;
      return {
        sq: +st.sq.toFixed(3), pitch: +st.pitch.toFixed(3), roll: +st.roll.toFixed(3),
        oSq: +ost.sq.toFixed(3), oRoll: +ost.roll.toFixed(3), oReact: +ost.react.toFixed(3),
        scaleY: +car.scale.y.toFixed(4),
        d: +Math.hypot(car.position.x - other.position.x, car.position.z - other.position.z).toFixed(2),
      };
    });
    samples.push(s);
  }
  await pg.keyboard.up('KeyW');
  const maxSq = Math.max(...samples.map(s => s.sq));
  const maxPitch = Math.max(...samples.map(s => Math.abs(s.pitch)));
  const maxRoll = Math.max(...samples.map(s => Math.abs(s.roll)));
  const maxOSq = Math.max(...samples.map(s => s.oSq));
  const maxOReact = Math.max(...samples.map(s => s.oReact));
  const minD = Math.min(...samples.map(s => s.d));
  console.log('[撞击采样] 玩家压扁max=', maxSq, '俯仰max=', maxPitch, '侧倾max=', maxRoll, '最近距离=', minD);
  console.log('           对方压扁max=', maxOSq, '侧倾max=', Math.max(...samples.map(s => Math.abs(s.oRoll))), '驾驶员反应max=', maxOReact);
  console.log('           末段样本', JSON.stringify(samples.slice(-5)));
  await pg.screenshot({ path: '/tmp/mp_bumper_hit.png' });
  await b.close();
})();
