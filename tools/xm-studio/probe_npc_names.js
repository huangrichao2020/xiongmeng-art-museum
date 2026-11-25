/* 四项改动验证：
   1) 游乐园大门已拆（门口不再有门楼构件）
   2) 留言亭是蛋仔风格（蛋型主体 + 糖果色）+ 面板 UI 蛋仔色
   3) 地面雪人数量下降
   4) 每个 NPC 都有小号名字牌（唯一名字 + 尺寸 + 不随压扁变形）
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
  pg.on('pageerror', e => errs.push('PAGEERR ' + String(e).slice(0, 240)));
  pg.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('CONSOLE ' + String(m.text()).slice(0, 240)); });
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  /* ── 1+2+3. 场景对象统计 ── */
  const scene = await pg.evaluate(() => {
    const V = window.diorama.scene().position.constructor;
    const out = { snowmen: 0, npcTags: 0, npcTotal: 0, tagNames: [], tagScale: [], guestbookEgg: false, fairGateParts: 0 };
    const near = (o, x, z, r) => { const p = new V(); o.getWorldPosition(p); return Math.hypot(p.x - x, p.z - z) < r; };
    // 雪人计数：身上有胡萝卜鼻(橙锥)的球体组 → 用 physObj 不好取，直接按材质特征找
    const orangeSet = new Set();
    window.diorama.scene().traverse(o => {
      if (o.isMesh && o.material && o.material.color) {
        const h = o.material.color.getHexString();
        if (h === 'ff7b28' || h === 'f97316' || h === 'ff8c42') orangeSet.add(o.uuid);
      }
    });
    // 蛋仔蛋型主体（黄色大球）—— 留言亭
    const eggGroups = [];
    window.diorama.scene().traverse(o => {
      if (o.isGroup && o.userData && o.userData.physObj && o.userData.physObj.type === 'guestbook') {
        out.guestbookEgg = true;
        const p = new V(); o.getWorldPosition(p);
        out.gbPos = [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)];
        // 数它内部 mesh 数 + 是否有黄色蛋体
        let yellowBig = false, meshes = 0;
        o.traverse(c => { if (c.isMesh) { meshes++; if (c.material && c.material.color && c.material.color.getHexString() === 'ffd84d' && c.geometry.parameters && c.geometry.parameters.radius > .8) yellowBig = true; } });
        out.gbMeshes = meshes; out.gbYellowEgg = yellowBig;
      }
      if (o.isGroup && o.userData && o.userData.legL && o.userData.armL) {
        out.npcTotal++;
        const tag = o.children.find(c => c.isSprite);
        if (tag) {
          out.npcTags++;
          if (out.tagScale.length < 3) out.tagScale.push([+tag.scale.x.toFixed(3), +tag.scale.y.toFixed(3)]);
        }
      }
    });
    // 雪人：数有橙色鼻子 mesh 的组（雪人组 = 含橙锥 + 白球的 group）
    window.diorama.scene().traverse(o => {
      if (!o.isGroup) return;
      let nose = 0, white = 0;
      o.traverse(c => {
        if (!c.isMesh || !c.material || !c.material.color) return;
        const h = c.material.color.getHexString();
        if (orangeSet.has(c.uuid)) nose++;
        if (h === 'f4f8ff' || h === 'ffffff' || h === 'f8fdff') white++;
      });
      if (nose >= 1 && white >= 2) out.snowmen++;
    });
    // 门楼残留：门口 (4,19.9) 半径 5m 内的大件构件数
    window.diorama.scene().traverse(o => {
      if (!o.isMesh) return;
      const p = new V(); o.getWorldPosition(p);
      if (Math.hypot(p.x - 4, p.z - 19.9) < 5.5 && o.geometry && o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere();
      if (Math.hypot(p.x - 4, p.z - 19.9) < 5.5) {
        const r = o.geometry && o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : 0;
        if (r > 1.2) out.fairGateParts++;
      }
    });
    return out;
  });
  console.log('场景统计:', JSON.stringify(scene, null, 1));

  /* ── NPC 名字唯一性 ── */
  const names = await pg.evaluate(() => {
    const V = window.diorama.scene().position.constructor;
    const arr = [];
    window.diorama.scene().traverse(o => {
      if (o.isGroup && o.userData && o.userData.legL && o.userData.armL) {
        const tag = o.children.find(c => c.isSprite);
        if (!tag) return;
        const cv = tag.material.map && tag.material.map.image;
        arr.push({ tag: !!tag, y: +tag.position.y.toFixed(3), sx: +tag.scale.x.toFixed(3) });
      }
    });
    return arr;
  });
  console.log('NPC 名字牌数 =', names.length, ' 样例:', JSON.stringify(names.slice(0, 3)));

  /* ── 名字牌不随压扁变化：制造一次 squash 看尺寸是否稳定 ── */
  const squash = await pg.evaluate(() => new Promise(res => {
    const V = window.diorama.scene().position.constructor;
    let target = null;
    window.diorama.scene().traverse(o => {
      if (!target && o.isGroup && o.userData && o.userData.legL && o.userData.armL) {
        const tag = o.children.find(c => c.isSprite);
        if (tag) target = { o, tag };
      }
    });
    if (!target) return res({ err: 'no npc' });
    const before = +target.tag.scale.x.toFixed(4);
    const beforeY = +target.tag.position.y.toFixed(4);
    // 人为把 NPC 组缩到 0.5（模拟压扁到极限）
    target.o.scale.set(0.5, 0.5, 0.5);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const after = +target.tag.scale.x.toFixed(4);
      const afterY = +target.tag.position.y.toFixed(4);
      target.o.scale.set(1, 1, 1);
      res({ before, after, beforeY, afterY });
    }));
  }));
  console.log('压扁时名字牌尺寸:', JSON.stringify(squash));

  /* ── 留言板 UI：打开面板看蛋仔配色 ── */
  await pg.evaluate(() => { window.diorama.guestbook(); });
  await pg.waitForTimeout(1200);
  const ui = await pg.evaluate(() => {
    const box = document.getElementById('gb-box');
    const cs = getComputedStyle(box);
    return {
      visible: document.getElementById('gb-modal').classList.contains('show'),
      radius: cs.borderRadius,
      bg: cs.backgroundImage.slice(0, 90),
      items: document.querySelectorAll('#gb-list .gb-item').length,
      headBg: getComputedStyle(document.getElementById('gb-head')).backgroundImage.slice(0, 80)
    };
  });
  console.log('留言板 UI:', JSON.stringify(ui));
  await pg.screenshot({ path: '/tmp/gb_eggy.png' });
  await pg.evaluate(() => { const b = document.getElementById('gb-close-btn'); if (b) b.click(); });
  await pg.waitForTimeout(400);

  /* ── 截图：游乐园入口（看门楼没了）+ 留言亭 + NPC 名字牌 ── */
  const shots = [
    ['fairent', -6, 6.5, 26, 4, 2.6, 20],
    ['gb', 4.0, 2.4, 20.5, 4.0, 1.8, 24.5],
    ['gbfar', 12, 3.4, 30, 4.0, 1.6, 24.5],
    ['npc', 10, 2.2, 26, 14, 1.4, 24],
    ['street', -2, 3.0, 4, -8, 1.6, -10]
  ];
  for (const [n, px, py, pz, tx, ty, tz] of shots) {
    await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), [px, py, pz, tx, ty, tz]);
    await pg.waitForTimeout(1400);
    await pg.screenshot({ path: '/tmp/nb_' + n + '.png' });
  }

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
