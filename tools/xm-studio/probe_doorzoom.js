/* 门特写：相机正对门，位置固定（只改 FOV 模拟人眼微动，不改位置）
   逐帧差分门区域 —— 相机不动则画面里的变化只能来自场景本身
   用法: node probe_doorzoom.js <url> */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:700,height:520}})).newPage();
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
    // 相机固定在门前 4m，正对门
    origSet(px,1.5,faceZ+4.0);
    camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position,new THREE.Vector3(px,1.35,faceZ),camera.up));
    camera.fov=38;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);

    const cv=renderer.domElement,w=cv.width,h=cv.height;
    function grab(){const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');cx.drawImage(cv,0,0);return cx.getImageData(0,0,w,h).data;}
    async function frames(n){const o=[];for(let i=0;i<n;i++){await new Promise(r=>requestAnimationFrame(()=>r()));o.push(grab());}return o;}
    function diffAll(f,label){
      const N=f.length;let c=0,tot=w*h,maxd=0;
      const hot=[];
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;let mx=0;
        for(let k=1;k<N;k++){const d=Math.abs(f[k][i]-f[0][i])+Math.abs(f[k][i+1]-f[0][i+1])+Math.abs(f[k][i+2]-f[0][i+2]);if(d>mx)mx=d;}
        if(mx>10){c++;if(mx>maxd)maxd=mx;hot.push([x,y,mx]);}
      }
      return {changed:c,pct:+(c/tot*100).toFixed(2),maxDelta:maxd,hot:hot.slice(0,5)};
    }
    const res={};
    // A. 现状
    await new Promise(r=>setTimeout(r,600));
    res.A_fixed=diffAll(await frames(14),'A');
    // 门区域（画面中央）
    const doorRect=[w*0.32,h*0.22,w*0.68,h*0.92];
    function diffRect(f){
      const N=f.length;let c=0,tot=0,maxd=0;
      const x0=doorRect[0]|0,y0=doorRect[1]|0,x1=doorRect[2]|0,y1=doorRect[3]|0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*w+x)*4;tot++;let mx=0;
        for(let k=1;k<N;k++){const d=Math.abs(f[k][i]-f[0][i])+Math.abs(f[k][i+1]-f[0][i+1])+Math.abs(f[k][i+2]-f[0][i+2]);if(d>mx)mx=d;}
        if(mx>10){c++;if(mx>maxd)maxd=mx;}}
      return {changed:c,total:tot,pct:+(c/tot*100).toFixed(2),maxDelta:maxd};
    }
    res.A_fixed.door=diffRect(await frames(14));

    // B. 旧的共面位置 + 无 polygonOffset
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
    res.bandCount=bands.length;
    if(bands.length){
      const orig=bands.map(o=>o.geometry.attributes.position.array.slice());
      const shift=d=>bands.forEach((o,i)=>{const a=o.geometry.attributes.position.array;for(let k=0;k<a.length;k+=3)a[k+2]=orig[i][k+2]+d;o.geometry.attributes.position.needsUpdate=true;o.geometry.computeBoundingBox();});
      bands.forEach(o=>{o.material.polygonOffset=false;o.material.needsUpdate=true;});
      shift(-0.05);
      await new Promise(r=>setTimeout(r,1000));
      res.B_old_nopoly=diffRect(await frames(14));
      bands.forEach(o=>{o.material.polygonOffset=true;o.material.polygonOffsetFactor=-4;o.material.polygonOffsetUnits=-4;o.material.needsUpdate=true;});
      await new Promise(r=>setTimeout(r,1000));
      res.C_old_poly=diffRect(await frames(14));
      shift(0.05);
      await new Promise(r=>setTimeout(r,1000));
      res.D_restored=diffRect(await frames(14));
    }
    return res;
  });
  console.log(JSON.stringify(out,null,2));
  await p.screenshot({path:'/tmp/doorzoom.png'});
  await b.close();
})();
