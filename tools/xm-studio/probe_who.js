/* 识别：①热力图上闪烁的像素是啥 ②灯下那排黑椭圆是啥 */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:700,height:520}})).newPage();
  await p.goto('http://127.0.0.1:8811/',{waitUntil:'load',timeout:120000});
  await p.waitForFunction(()=>window.XM&&window.__PROBE,{timeout:120000});
  await p.waitForTimeout(9000);
  const res=await p.evaluate(async()=>{
    const {renderer,camera,scene,THREE,XM}=window.__PROBE;
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
    const rc=new THREE.Raycaster();const ndc=new THREE.Vector2();
    const meshList=[];scene.traverse(q=>{if(q.isMesh&&!q.isSprite)meshList.push(q);});
    function identify(x,y){
      ndc.set((x/w)*2-1,-(y/h)*2+1);
      rc.setFromCamera(ndc,camera);
      const hits=rc.intersectObjects(meshList,false).filter(q=>q.object.visible&&q.object.material&&q.object.material.opacity!==0);
      if(!hits.length)return null;
      const q=hits[0].object,m=q.material;
      return {col:m.color?'#'+m.color.getHexString():'-',type:m.type,
        add:m.blending===THREE.AdditiveBlending,
        map:m.map?(m.map.image?m.map.image.width+'x'+m.map.image.height:'?'):'-',
        geo:q.geometry.type, par:JSON.stringify(q.geometry.parameters||{}).slice(0,90),
        z:+hits[0].point.z.toFixed(3)};
    }
    // ① 闪的点（热力图红点）
    const flashPts=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;let mx=0;
      for(let k=1;k<N;k++){const d=Math.abs(o[k][i]-o[0][i])+Math.abs(o[k][i+1]-o[0][i+1])+Math.abs(o[k][i+2]-o[0][i+2]);if(d>mx)mx=d;}
      if(mx>40)flashPts.push([x,y,mx]);
    }
    const tally={};
    flashPts.slice(0,300).forEach(([x,y])=>{
      const id=identify(x,y); if(!id){tally['<none>']=(tally['<none>']||0)+1;return;}
      const k=id.col+' '+id.type+(id.add?'+ADD':'')+' map='+id.map+' '+id.geo+' z='+id.z;
      tally[k]=(tally[k]||0)+1;
    });
    // ② 黑椭圆（截图里灯下方那排，大约 y=85, x=150..540）
    const blackTally={};
    for(let x=150;x<540;x+=8){
      const id=identify(x,85);
      if(!id){blackTally['<none>']=(blackTally['<none>']||0)+1;continue;}
      const k=id.col+' '+id.type+' map='+id.map+' '+id.geo+' par='+id.par;
      blackTally[k]=(blackTally[k]||0)+1;
    }
    // ③ 黑椭圆处像素的实际颜色
    const sample=[];
    for(let x=170;x<=500;x+=55){const i=(85*w+x)*4;sample.push([x,o[0][i],o[0][i+1],o[0][i+2]]);}
    return {flashCount:flashPts.length,flashWhat:tally,blackRow:blackTally,blackPixelRGB:sample};
  });
  console.log(JSON.stringify(res,null,2));
  await b.close();
})();
