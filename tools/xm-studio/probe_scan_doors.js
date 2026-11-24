/* 扫遍所有店/摊/亭的位置，测各自门口的闪烁（相机绕着转） */
const { chromium } = require('playwright-core');
const path=require('path'),os=require('os');
const EXE=path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async()=>{
  const b=await chromium.launch({executablePath:EXE,args:['--use-gl=angle','--use-angle=metal','--enable-gpu']});
  const p=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  p.on('pageerror',e=>console.log('[pageerror]',String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/',{waitUntil:'load',timeout:120000});
  await p.waitForFunction(()=>window.XM&&window.__PROBE,{timeout:120000});
  await p.waitForTimeout(9000);
  const out=await p.evaluate(async()=>{
    const {renderer,scene,camera,THREE}=window.__PROBE;
    const cv=renderer.domElement,w=cv.width,h=cv.height;
    function grab(){const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');cx.drawImage(cv,0,0);return cx.getImageData(0,0,w,h).data;}
    async function sweep(n,px,py,pz,tx,ty,tz){
      const o=[];
      for(let i=0;i<n;i++){
        const t=i/n*Math.PI*2;
        camera.position.set(px+Math.sin(t)*1.6,py+Math.sin(t*.7)*.2,pz+Math.cos(t)*1.2);
        camera.lookAt(tx,ty,tz);camera.updateMatrixWorld(true);
        await new Promise(r=>requestAnimationFrame(()=>r()));o.push(grab());
      }
      return o;
    }
    // 门正面矩形投影
    function rect(cx,cy,cz,hw,hh){
      const pts=[[-hw,0],[hw,0],[-hw,hh],[hw,hh]].map(([lx,ly])=>{
        const v=new THREE.Vector3(cx+lx,cy+ly,cz);v.project(camera);
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
    // 目标清单：街边店14 + 市集摊9 + 游乐园摊6 + 亭
    const SHOPS=[
      {x:-14.6,z:-30.1,rot:0},{x:-9.0,z:-30.1,rot:0},{x:-3.4,z:-30.1,rot:0},{x:2.2,z:-30.1,rot:0},{x:7.8,z:-30.1,rot:0},{x:13.4,z:-30.1,rot:0},
      {x:-63.1,z:-9.5,rot:Math.PI/2},{x:-63.1,z:-5.0,rot:Math.PI/2},{x:-63.1,z:-0.5,rot:Math.PI/2},{x:-63.1,z:4.0,rot:Math.PI/2},
      {x:63.1,z:-9.5,rot:-Math.PI/2},{x:63.1,z:-5.0,rot:-Math.PI/2},{x:63.1,z:-0.5,rot:-Math.PI/2},{x:63.1,z:4.0,rot:-Math.PI/2}
    ];
    const results=[];
    for(const s of SHOPS){
      const dx=Math.sin(s.rot)*1.8, dz=Math.cos(s.rot)*1.8;
      const cx=s.x+dx, cz=s.z+dz;
      const f=await sweep(20,cx,1.4,cz+4,s.x,1.4,s.z);
      const r=rect(s.x,0.3,s.z+Math.cos(s.rot)*1.8,1.1,1.9);
      const d=diffRect(f,r);
      results.push({kind:'shop',x:s.x,z:s.z,...d});
    }
    return results;
  });
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();
