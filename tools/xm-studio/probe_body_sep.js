/* 精确判定：人物躯干 mesh 是否被外层合批「摘走烘进世界坐标」
   判据：person group 的直接子 mesh 数（躯干还在 = >0；被摘走 = 只剩四肢 keep 子树）
   同时比对 body mesh 世界位移 vs group 世界位移（分离 = body 不动） */
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
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  const sample = () => pg.evaluate(() => {
    const res = [];
    const V = window.diorama.scene().position.constructor;
    window.diorama.scene().traverse(o => {
      if (!(o.isGroup && o.userData && o.userData.legL && o.userData.armL)) return;
      // 直接子 mesh = 躯干（若被合批摘走，这里会是 0）
      const directMeshes = o.children.filter(c => c.isMesh);
      // 躯干候选：直接子 mesh 里 y 偏移最接近 0.48*scale 的那个
      const gp = new V(), bp = new V();
      o.getWorldPosition(gp);
      let body = null;
      for (const m of directMeshes) { m.getWorldPosition(bp); if (!body) body = { m, y: bp.y }; }
      const rec = {
        directMesh: directMeshes.length,
        childKinds: o.children.map(c => (c.isMesh ? 'mesh' : c.isGroup ? 'grp' : '?')),
        grp: [+gp.x.toFixed(2), +gp.y.toFixed(2), +gp.z.toFixed(2)],
        body: body ? [+body.m.getWorldPosition(new V()).x.toFixed(2), +body.m.getWorldPosition(new V()).y.toFixed(2), +body.m.getWorldPosition(new V()).z.toFixed(2)] : null,
        scale: +o.scale.x.toFixed(3)
      };
      res.push(rec);
    });
    return res;
  });

  const s1 = await sample();
  await pg.waitForTimeout(2600);
  const s2 = await sample();
  console.log('人物总数 =', s2.length);
  const noBody = s2.filter(r => r.directMesh === 0);
  console.log('躯干被摘走（直接子 mesh = 0）的人数 =', noBody.length);
  if (noBody.length) console.log('  样例:', JSON.stringify(noBody.slice(0, 5)));

  // 位移一致性：body 动 vs group 不动 = 分离
  let sep = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    const a = s1[i], b = s2[i];
    if (!a || !b || !b.body || !a.body) continue;
    const gd = Math.hypot(b.grp[0] - a.grp[0], b.grp[1] - a.grp[1], b.grp[2] - a.grp[2]);
    const bd = Math.hypot(b.body[0] - a.body[0], b.body[1] - a.body[1], b.body[2] - a.body[2]);
    if (gd > 0.03 && Math.abs(gd - bd) > 0.05) { sep++; if (sep <= 8) console.log(`  分离 #${i} groupΔ=${gd.toFixed(3)} bodyΔ=${bd.toFixed(3)} directMesh=${b.directMesh}`); }
  }
  console.log('group动了但body没跟上的人数 =', sep);

  // 马戏团专属：4 个表演位 + 观众 + 钢丝熊 + 吊环熊
  const circus = await pg.evaluate(() => {
    const V = window.diorama.scene().position.constructor;
    const res = {};
    window.diorama.scene().traverse(o => {
      if (!(o.isGroup && o.userData && o.userData.legL && o.userData.armL)) return;
      const gp = new V(); o.getWorldPosition(gp);
      const key = 'P' + Math.round(gp.x) + '_' + Math.round(gp.z) + '_' + Math.round(gp.y);
      res[key] = { directMesh: o.children.filter(c => c.isMesh).length, y: +gp.y.toFixed(2), x: +gp.x.toFixed(2), z: +gp.z.toFixed(2) };
    });
    return res;
  });
  const near = Object.entries(circus).filter(([k]) => {
    const m = k.match(/P(-?[\d.]+)_(-?[\d.]+)_(-?[\d.]+)/);
    if (!m) return false;
    const x = +m[1], z = +m[2];
    return Math.abs(x - 50) < 14 && Math.abs(z - 30) < 14;
  });
  console.log('马戏团附近人物（x/z/y = 世界坐标）:');
  for (const [k, v] of near) console.log('   ', k, JSON.stringify(v));

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
