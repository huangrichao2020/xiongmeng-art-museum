/* 鸟巢 v2 自检：尺寸 / 报错 / 柱子落点 / 大兔子落地 / 场景角色清单 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const { pickAccounts } = require('./mp-accounts');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  pickAccounts('au');
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const pg = await ctx.newPage();
  const errs = [], cerr = [];
  pg.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error') cerr.push(m.text().slice(0, 240)); });
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(11000);
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    document.querySelectorAll('.mp-login,.login-mask,#mp-login *').forEach(e => { e.style.display = 'none'; });
  });
  await pg.waitForTimeout(1200);

  const r = await pg.evaluate(() => {
    const sc = window.diorama.scene();
    const V3 = window.diorama.cam ? null : null;
    const mkV = (x,y,z)=>{const o=sc.position.clone();o.set(x,y,z);return o;};
    const out = { errs: [], birds: [], figures: [] };
    let nest = null, park = null;
    sc.traverse(o => {
      if (o.userData && o.userData.tag === 'nest' && !nest) nest = o;
      if (o.userData && o.userData.tag === 'park' && !park) park = o;
    });
    if (!nest) return { err: 'no nest' };
    nest.updateMatrixWorld(true);
    const BX={minX:1e9,minY:1e9,minZ:1e9,maxX:-1e9,maxY:-1e9,maxZ:-1e9};
    const tmp={minX:1e9,minY:1e9,minZ:1e9,maxX:-1e9,maxY:-1e9,maxZ:-1e9};
    let meshes = 0, instTotal = 0, tris = 0;
    const instInfo = [];
    nest.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      if (o.isInstancedMesh) { instTotal += o.count; instInfo.push(o.count + '×' + o.geometry.type); }
      const g = o.geometry; if (!g || !g.attributes.position) return;
      const idx = g.index ? g.index.count : g.attributes.position.count;
      tris += idx / 3 * (o.isInstancedMesh ? o.count : 1);
      if (!g.boundingBox) g.computeBoundingBox();
      const bb=g.boundingBox;
      tmp.minX=bb.min.x;tmp.maxX=bb.max.x;tmp.minY=bb.min.y;tmp.maxY=bb.max.y;tmp.minZ=bb.min.z;tmp.maxZ=bb.max.z;
      for(const k of ['minX','minY','minZ']) tmp[k]=Math.min(tmp[k],tmp[k]);
      const e=o.matrixWorld.elements;
      const pts=[[tmp.minX,tmp.minY,tmp.minZ],[tmp.maxX,tmp.minY,tmp.minZ],[tmp.minX,tmp.maxY,tmp.minZ],[tmp.minX,tmp.minY,tmp.maxZ],[tmp.maxX,tmp.maxY,tmp.maxZ],[tmp.minX,tmp.maxY,tmp.maxZ],[tmp.maxX,tmp.minY,tmp.maxZ],[tmp.maxX,tmp.maxY,tmp.minZ]];
      for(const p of pts){
        const x=e[0]*p[0]+e[4]*p[1]+e[8]*p[2]+e[12];
        const y=e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13];
        const z=e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14];
        BX.minX=Math.min(BX.minX,x);BX.maxX=Math.max(BX.maxX,x);
        BX.minY=Math.min(BX.minY,y);BX.maxY=Math.max(BX.maxY,y);
        BX.minZ=Math.min(BX.minZ,z);BX.maxZ=Math.max(BX.maxZ,z);
      }
    });
    out.nest = {
      spanX: +(BX.maxX - BX.minX).toFixed(1),
      spanZ: +(BX.maxZ - BX.minZ).toFixed(1),
      spanY: +(BX.maxY - BX.minY).toFixed(1),
      top: +BX.maxY.toFixed(2),
      meshes, instTotal, tris: Math.round(tris), instInfo
    };
    /* 屋面南北端 / 东西端真实高度：用最高点 mesh 的位置判断 */
    /* ── Line Friends（熊 + 长耳兔）雕像：最低点 vs 基座顶 ── */
    if (park) {
      park.updateMatrixWorld(true);
      const peds = [];
      park.traverse(o => {
        if (!o.isGroup) return;
        const p=mkV(0,0,0); o.getWorldPosition(p);
        if (Math.abs(p.x - 36.7) < 0.6 && Math.abs(p.z - 4.6) < 0.6) peds.push({ o, p });
      });
      for (const ped of peds) {
        const b2={minX:1e9,minY:1e9,minZ:1e9,maxX:-1e9,maxY:-1e9,maxZ:-1e9};
        ped.o.traverse(o => {
          if (!o.isMesh) return;
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          const bb=o.geometry.boundingBox, e=o.matrixWorld.elements;
          const pts=[[bb.min.x,bb.min.y,bb.min.z],[bb.max.x,bb.max.y,bb.max.z],[bb.min.x,bb.max.y,bb.min.z],[bb.max.x,bb.min.y,bb.max.z]];
          for(const q of pts){
            const x=e[0]*q[0]+e[4]*q[1]+e[8]*q[2]+e[12];
            const y=e[1]*q[0]+e[5]*q[1]+e[9]*q[2]+e[13];
            const z=e[2]*q[0]+e[6]*q[1]+e[10]*q[2]+e[14];
            b2.minX=Math.min(b2.minX,x);b2.maxX=Math.max(b2.maxX,x);
            b2.minY=Math.min(b2.minY,y);b2.maxY=Math.max(b2.maxY,y);
            b2.minZ=Math.min(b2.minZ,z);b2.maxZ=Math.max(b2.maxZ,z);
          }
        });
        if (b2.minY>1e8) continue;
        out.figures.push({
          what: 'LineFriends 雕像组', x: +ped.p.x.toFixed(1), z: +ped.p.z.toFixed(1),
          bottom: +b2.minY.toFixed(3), top: +b2.maxY.toFixed(2),
          width: +(b2.maxX - b2.minX).toFixed(2)
        });
      }
      /* 底座顶面：动漫园底座 y = .14+.47 = .61 */
      out.pedestalTop = 0.61;
      /* 动漫园 12 座角色：列出各自世界包围盒，方便核对哪一座是「大兔子」 */
      const seen = [];
      park.traverse(o => {
        if (!o.isGroup) return;
        const p=mkV(0,0,0); o.getWorldPosition(p);
        if (p.y < 0.2 || p.y > 3) return;
        const b3={minX:1e9,minY:1e9,minZ:1e9,maxX:-1e9,maxY:-1e9,maxZ:-1e9};
        let has = false;
        o.traverse(c => { if (c.isMesh) { has = true; if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
          const bb=c.geometry.boundingBox,e=c.matrixWorld.elements;
          const pts=[[bb.min.x,bb.min.y,bb.min.z],[bb.max.x,bb.max.y,bb.max.z],[bb.min.x,bb.max.y,bb.min.z],[bb.max.x,bb.min.y,bb.max.z]];
          for(const q of pts){
            const x=e[0]*q[0]+e[4]*q[1]+e[8]*q[2]+e[12];
            const y=e[1]*q[0]+e[5]*q[1]+e[9]*q[2]+e[13];
            const z=e[2]*q[0]+e[6]*q[1]+e[10]*q[2]+e[14];
            b3.minX=Math.min(b3.minX,x);b3.maxX=Math.max(b3.maxX,x);
            b3.minY=Math.min(b3.minY,y);b3.maxY=Math.max(b3.maxY,y);
            b3.minZ=Math.min(b3.minZ,z);b3.maxZ=Math.max(b3.maxZ,z);
          } } });
        if (!has || b3.minY>1e8) return;
        seen.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), w: +(b3.maxX-b3.minX).toFixed(1), h: +(b3.maxY-b3.minY).toFixed(1), bot: +b3.minY.toFixed(2) });
      });
      out.figures = out.figures.concat(seen);
    }
    return out;
  });
  console.log('页面错误:', errs.length, errs.slice(0, 4));
  console.log('控制台错误:', cerr.length, cerr.slice(0, 4));
  console.log('鸟巢:', JSON.stringify(r.nest, null, 1));
  console.log('动漫园对象 (x,z,w=宽,h=高,bot=离地):');
  console.table(r.figures);
  console.log('底座顶面 y =', r.pedestalTop);

  /* 截图 */
  const shots = [
    ['nest_far', [46, 26, -44], [0, 12, -100]],
    ['nest_gate', [0, 6, -30], [0, 10, -100]],
    ['nest_top', [0, 46, -100], [0, 6, -100]]
  ];
  for (const [name, pos, tgt] of shots) {
    await pg.evaluate(([p, t]) => { window.MP.freezeCam(p[0], p[1], p[2], t[0], t[1], t[2]); }, [pos, tgt]);
    await pg.waitForTimeout(2200);
    await pg.screenshot({ path: '/tmp/nv2_' + name + '.png' });
  }
  console.log('截图: /tmp/nv2_nest_far.png / nest_gate / nest_top');
  await b.close();
})();
