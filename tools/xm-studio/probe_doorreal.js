/* 真实测量：相机接管后，对准北街咖啡店的门，移动相机扫掠，测门正面闪烁
   A. 现状（贴片 face+.17 + polygonOffset）
   B. 还原旧的共面位置 face+.12 且去掉 polygonOffset
   C. face+.12 + polygonOffset
   D. 恢复
   用法: node probe_doorreal.js <url> */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  p.on('pageerror',e=>console.log('[pageerror]',String(e).slice(0,200)));
  await p.goto(process.argv[2]||'http://127.0.0.1:8811/',{waitUntil:'load',timeout:120000});
  await p.waitForFunction(()=>window.XM&&window.__PROBE,{timeout:120000});
  await p.waitForTimeout(9000);

  const out=await p.evaluate(async()=>{
    const {renderer,scene,camera,THREE,XM}=window.__PROBE;
    XM.shot('shops');
    const origSet=camera.position.set.bind(camera.position);
    camera.position.set=()=>{};camera.position.copy=()=>{};camera.lookAt=()=>{};
    const px=-14.6, faceZ=-28.3;

    const cv=renderer.domElement,w=cv.width,h=cv.height;
    function grab(){const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');cx.drawImage(cv,0,0);return cx.getImageData(0,0,w,h).data;}

    // 相机绕门缓慢移动（人走动的视角变化）
    async function sweep(n,dist){
      const o=[];
      for(let i=0;i<n;i++){
        const t=i/n*Math.PI*2;
        origSet(px+Math.sin(t)*1.5,1.5+Math.sin(t*.6)*.25,faceZ+dist+Math.cos(t)*1.0);
        camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position,new THREE.Vector3(px,1.45,faceZ),camera.up));
        camera.updateMatrixWorld(true);
        await new Promise(r=>requestAnimationFrame(()=>r()));
        o.push(grab());
      }
      return o;
    }
    // 门正面矩形（世界 → 屏幕）
    function doorRect(){
      const pts=[[-0.6,0.35],[0.6,0.35],[-0.6,2.25],[0.6,2.25]].map(([lx,ly])=>{
        const v=new THREE.Vector3(px+lx,ly,faceZ);v.project(camera);
        return [(v.x*.5+.5)*w,(-v.y*.5+.5)*h];});
      const xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]);
      return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
    }
    function diffRect(f,r){
      const N=f.length;let c=0,tot=0,maxd=0;
      const x0=Math.max(0,r[0]|0),y0=Math.max(0,r[1]|0),x1=Math.min(w,r[2]|0),y1=Math.min(h,r[3]|0);
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
        const i=(y*w+x)*4;tot++;let mx=0;
        for(let k=1;k<N;k++){const d=Math.abs(f[k][i]-f[0][i])+Math.abs(f[k][i+1]-f[0][i+1])+Math.abs(f[k][i+2]-f[0][i+2]);if(d>mx)mx=d;}
        if(mx>10){c++;if(mx>maxd)maxd=mx;}
      }
      return {changed:c,total:tot,pct:+(c/tot*100).toFixed(2),maxDelta:maxd};
    }

    // 找门口暖光贴片（竖直 1.5x2.2 位于门平面上方）
    const bands=[];
    scene.traverse(o=>{
      if(o.isMesh&&!o.isSprite&&o.material&&o.material.type==='MeshBasicMaterial'
        &&o.material.blending===THREE.AdditiveBlending&&o.material.color.getHexString()==='ffbe7a'){
        const bb=new THREE.Box3().setFromObject(o);
        const cx=(bb.min.x+bb.max.x)/2,cy=(bb.min.y+bb.max.y)/2,cz=(bb.min.z+bb.max.z)/2;
        if(bb.max.z-bb.min.z<0.02&&Math.abs(bb.max.x-bb.min.x-1.5)<0.1&&Math.abs(bb.max.y-bb.min.y-2.2)<0.1
          &&Math.abs(cx-px)<0.4&&Math.abs(cy-1.30)<0.2&&Math.abs(cz-(faceZ+0.17))<0.05) bands.push(o);
      }
    });
    const res={bandCount:bands.length};
    if(!bands.length) return res;
    const orig=bands.map(o=>o.geometry.attributes.position.array.slice());
    function shiftZ(d){bands.forEach((o,i)=>{const a=o.geometry.attributes.position.array;for(let k=0;k<a.length;k+=3)a[k+2]=orig[i][k+2]+d;o.geometry.attributes.position.needsUpdate=true;o.geometry.computeBoundingBox();});}

    await new Promise(r=>setTimeout(r,500));
    let f=await sweep(20,5.5);
    res.A_fixed_017_poly=diffRect(f,doorRect());

    bands.forEach(o=>{o.material.polygonOffset=false;o.material.needsUpdate=true;});
    shiftZ(-0.05);
    await new Promise(r=>setTimeout(r,1000));
    f=await sweep(20,5.5);
    res.B_old_012_nopoly=diffRect(f,doorRect());

    bands.forEach(o=>{o.material.polygonOffset=true;o.material.polygonOffsetFactor=-4;o.material.polygonOffsetUnits=-4;o.material.needsUpdate=true;});
    await new Promise(r=>setTimeout(r,1000));
    f=await sweep(20,5.5);
    res.C_old_012_poly=diffRect(f,doorRect());

    shiftZ(0.05);
    await new Promise(r=>setTimeout(r,1000));
    f=await sweep(20,5.5);
    res.D_restored=diffRect(f,doorRect());

    return res;
  });
  console.log(JSON.stringify(out,null,2));
  await b.close();
})();
