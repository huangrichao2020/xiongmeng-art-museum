/* 顶点色属性体检：有没有被填成 >1 的值（Uint8 数组直接拷进 Float32 的典型症状） */
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
    const T=window.XM_TOUR; const rows=[];
    T.scene.traverse(o=>{
      if(!o.isMesh||!o.visible)return;
      const g=o.geometry; if(!g||!g.attributes.color)return;
      const a=g.attributes.color.array;
      let mn=1e9,mx=-1e9,over=0;
      for(let i=0;i<a.length;i++){const v=a[i]; if(v<mn)mn=v; if(v>mx)mx=v; if(v>1.01)over++;}
      rows.push({type:a.constructor.name, item:g.attributes.color.itemSize, norm:g.attributes.color.normalized,
        mn:+mn.toFixed(3), mx:+mx.toFixed(3), over, n:a.length,
        m:o.material&&o.material.color?'#'+o.material.color.getHexString():'?',
        vc:!!(o.material&&o.material.vertexColors)});
    });
    return rows;
  });
  console.log('带顶点色的 mesh 数:', r.length);
  r.slice(0,25).forEach(x=>console.log(`  ${x.type} item=${x.item} norm=${x.norm?1:0} 范围[${x.mn},${x.mx}] 超1的数:${x.over}/${x.n} 材质${x.m} vcol=${x.vc?1:0}`));
  await b.close();
})();
