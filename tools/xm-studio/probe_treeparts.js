/* 树/大件的部件半径清单：定剔除阈值用 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const pg = await (await b.newContext({ viewport:{width:800,height:500} })).newPage();
  pg.on('pageerror', e=>console.log('[err]',String(e).slice(0,160)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.XM_TOUR, null, {timeout:180000});
  await pg.evaluate(()=>{document.querySelectorAll('#mp-login,#mp-mask,#boot').forEach(e=>e.style.display='none');});
  await pg.waitForTimeout(9000);
  const r = await pg.evaluate(()=>{
    const T=window.XM_TOUR, THREE=T.THREE;
    const out=[];
    // 找所有含 mesh 的 group，按世界包围盒半径排序，看小部件都长什么样
    const groups=[];
    T.scene.traverse(o=>{
      if(!o.isGroup)return;
      const box=new THREE.Box3(); box.setFromObject(o);
      if(box.isEmpty())return;
      const size=box.getSize(new THREE.Vector3());
      const rad=Math.max(size.x,size.y,size.z)/2;
      if(rad>4)return;
      const parts=[];
      o.traverse(m=>{
        if(!m.isMesh)return;
        if(!m.geometry.boundingSphere)m.geometry.computeBoundingSphere();
        const sc=m.getWorldScale(new THREE.Vector3());
        const r2=m.geometry.boundingSphere.radius*Math.max(sc.x,sc.y,sc.z);
        parts.push({r:+r2.toFixed(2), c:m.material&&m.material.color?'#'+m.material.color.getHexString():'?'});
      });
      if(parts.length)groups.push({rad:+rad.toFixed(2), n:parts.length, parts, c:box.getCenter(new THREE.Vector3())});
    });
    groups.sort((a,b)=>b.rad-a.rad);
    // 统计：部件半径分布（只看半径<2 的）
    const hist={};
    groups.forEach(g=>g.parts.forEach(p=>{const k=p.r<=0.3?'≤0.3':p.r<=0.5?'≤0.5':p.r<=0.8?'≤0.8':p.r<=1.2?'≤1.2':p.r<=2?'≤2':'>2';hist[k]=(hist[k]||0)+1;}));
    // 找 radius 0.5~1.3 的部件属于哪些 group（危险区：可能是大件的组成部分）
    const risky=[];
    groups.forEach(g=>g.parts.forEach(p=>{if(p.r>0.5&&p.r<1.4)risky.push({groupRad:g.rad, partRad:p.r, n:g.parts.length, c:[g.c.x.toFixed(0),g.c.y.toFixed(0),g.c.z.toFixed(0)].join(',')});}));
    return {n:groups.length, hist, risky:risky.slice(0,25), riskyN:risky.length,
      samples: groups.slice(0,8).map(g=>`组r=${g.rad} ${g.parts.map(p=>p.r+p.c).join(' ')}`)};
  });
  console.log('小 group 数', r.n);
  console.log('部件半径分布', JSON.stringify(r.hist));
  console.log('\n危险区部件（0.5~1.4m，可能属于大件）共', r.riskyN, '个：');
  r.risky.forEach(x=>console.log(`  组r=${x.groupRad} 部件r=${x.partRad} 该组${x.n}个mesh @${x.c}`));
  console.log('\n样例:'); r.samples.forEach(s=>console.log('  '+s));
  await b.close();
})();
