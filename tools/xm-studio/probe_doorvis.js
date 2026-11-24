/* 门区域逐帧热力图：把变化像素画成图，直接看哪里在闪 */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:700,height:520}})).newPage();
  await p.goto(process.argv[2]||'http://127.0.0.1:8811/',{waitUntil:'load',timeout:120000});
  await p.waitForFunction(()=>window.XM&&window.__PROBE,{timeout:120000});
  await p.waitForTimeout(9000);
  const res=await p.evaluate(async()=>{
    const {renderer,camera,XM,THREE}=window.__PROBE;
    XM.shot('shops');
    const origSet=camera.position.set.bind(camera.position);
    camera.position.set=()=>{};camera.position.copy=()=>{};camera.lookAt=()=>{};
    const px=-14.6,faceZ=-28.3;
    origSet(px,1.5,faceZ+4.0);
    camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position,new THREE.Vector3(px,1.35,faceZ),camera.up));
    camera.fov=38;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const cv=renderer.domElement,w=cv.width,h=cv.height;
    function grab(){const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');cx.drawImage(cv,0,0);return cx.getImageData(0,0,w,h).data;}
    const N=16,o=[];
    for(let i=0;i<N;i++){await new Promise(r=>requestAnimationFrame(()=>r()));o.push(grab());}
    // 输出热力图 dataURL
    const c2=document.createElement('canvas');c2.width=w;c2.height=h;
    const cx2=c2.getContext('2d');
    const img=cx2.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      let mx=0;
      for(let k=1;k<N;k++){const d=Math.abs(o[k][i*4]-o[0][i*4])+Math.abs(o[k][i*4+1]-o[0][i*4+1])+Math.abs(o[k][i*4+2]-o[0][i*4+2]);if(d>mx)mx=d;}
      const v=Math.min(255,mx*3);
      img.data[i*4]=v;img.data[i*4+1]=v>0?0:0;img.data[i*4+2]=0;img.data[i*4+3]=255;
    }
    cx2.putImageData(img,0,0);
    return {url:c2.toDataURL(),w,h};
  });
  const fs=require('fs');
  fs.writeFileSync('/tmp/doorheat.png',Buffer.from(res.url.split(',')[1],'base64'));
  console.log('wrote /tmp/doorheat.png',res.w,res.h);
  await b.close();
})();
