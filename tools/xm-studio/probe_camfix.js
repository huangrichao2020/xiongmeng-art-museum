/* 相机接管正确姿势：先 XM.shot 进场景，再把 position.set/copy/lookAt 全打成空函数，
   最后手动设一次位置。导演机位每帧覆写 camera，所以必须打补丁。
   用法: node probe_camfix.js <url> */
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
  const info=await p.evaluate(()=>{
    const {camera,XM}=window.__PROBE;
    XM.shot('shops');
    // 等一拍让导演机位落位
    const origSet=camera.position.set.bind(camera.position);
    const origCopy=camera.position.copy.bind(camera.position);
    camera.position.set=()=>{};
    camera.position.copy=()=>{};
    camera.lookAt=()=>{};
    camera.position.set=(x,y,z)=>origSet(x,y,z);
    camera.updateMatrixWorld(true);
    return {pos:[camera.position.x,camera.position.y,camera.position.z]};
  });
  console.log('camera after XM.shot:',info.pos);
  await p.waitForTimeout(2000);
  const after=await p.evaluate(()=>{
    const {camera}=window.__PROBE;
    return {pos:[+camera.position.x.toFixed(3),+camera.position.y.toFixed(3),+camera.position.z.toFixed(3)]};
  });
  console.log('camera 2s later (should be identical):',after.pos);
  await b.close();
})();
