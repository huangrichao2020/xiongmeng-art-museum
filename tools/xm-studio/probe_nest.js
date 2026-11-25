/* 鸟巢体育城改造体检：场景统计 + 盖楼自测 + 定点截图（本地构建版） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const accs = pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [], missing = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + String(e.stack || e).slice(0, 300)));
  pg.on('response', r => { if (r.status() === 404) missing.push(r.url().replace('http://127.0.0.1:8899', '')); });
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.diorama && window.diorama.scene, null, { timeout: 120000 });
  const login = (a) => pg.evaluate((acc) => {
    const A = document.getElementById('mp-acc'), P = document.getElementById('mp-pass');
    if (A && P) { A.value = acc; P.value = '123456'; document.getElementById('mp-go').click(); }
  }, a);
  await login(accs.a);
  await pg.waitForTimeout(14000);

  const r = await pg.evaluate(() => {
    const sc = window.diorama.scene();
    let meshes = 0, tris = 0, inst = 0, rod = 0;
    const tags = {};
    sc.traverse(o => {
      if (o.isInstancedMesh) { inst++; if (o.count >= 500) rod = o.count; }
      else if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; }
      const t = o.userData && o.userData.tag; if (t) tags[t] = (tags[t] || 0) + 1;
    });
    return {
      meshes, tris: Math.round(tris), inst, rod, tags,
      nest: window.diorama.bbox('nest'), sports: window.diorama.bbox('sports'),
      perf: window.diorama.perf()
    };
  });
  console.log('SCENE ' + JSON.stringify(r));

  /* 盖楼自测：给每一封主帖塞两条回复（一级 + 二级），刷新后打开留言板看渲染 */
  await pg.evaluate(async () => {
    window.diorama.guestbook();
    await new Promise(r => setTimeout(r, 2000));
    const ids = [...document.querySelectorAll('.gb-item')].map(e => e.dataset.id);
    const store = {};
    ids.forEach((id) => {
      store[id] = [
        { id: 'r' + id + 'a', author: '测试甲', content: '第一层回复', created_at: '2026-11-25 20:00', parentId: null, parentAuthor: null },
        { id: 'r' + id + 'b', author: '测试乙', content: '回复甲的楼', created_at: '2026-11-25 20:01', parentId: 'r' + id + 'a', parentAuthor: '测试甲' }
      ];
    });
    localStorage.setItem('xm_gb_replies', JSON.stringify(store));
    return ids.length;
  });
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForFunction(() => window.diorama && window.diorama.scene, null, { timeout: 120000 });
  await login(accs.a);
  await pg.waitForTimeout(9000);
  const gb = await pg.evaluate(async () => {
    window.diorama.guestbook();
    await new Promise(r => setTimeout(r, 2500));
    const th = document.querySelector('.gb-thread');
    const badges = [...document.querySelectorAll('.gb-item .badge')].map(e => e.textContent);
    return {
      badges,
      thread: th ? th.textContent.replace(/\s+/g, ' ').slice(0, 140) : null,
      replies: document.querySelectorAll('.gb-rl').length,
      childReplies: document.querySelectorAll('.gb-rl.child').length,
      replyButtons: document.querySelectorAll('.gb-rl .act').length,
      hasInput: !!document.getElementById('gb-rep-txt')
    };
  });
  console.log('GUESTBOOK ' + JSON.stringify(gb));
  await pg.evaluate(() => document.getElementById('gb-close-btn').click());

  for (const [id, out] of [['nest-stadium', '/tmp/shot_nest.png'], ['sports-complex', '/tmp/shot_sports.png'], ['plaza-night', '/tmp/shot_axis.png']]) {
    await pg.evaluate((i) => window.diorama.shot(i), id);
    await pg.waitForTimeout(5000);
    await pg.screenshot({ path: out });
    console.log('SHOT ' + out);
  }
  console.log('MISSING ' + JSON.stringify([...new Set(missing)].slice(0, 12)));
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 8).join('\n') : 'no page errors');
  await b.close();
})();
