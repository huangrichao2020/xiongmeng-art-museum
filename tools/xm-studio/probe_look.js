/* 人工目视用：固定机位拍各店/摊的门，连拍 4 帧看有无闪烁 */
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
  const spots=[
    {n:'shop_north', pos:[-14.6,1.6,-21.0], look:[-14.6,1.6,-28.3]},
    {n:'shop_west',  pos:[-55.0,1.6,-9.5],  look:[-63.1,1.6,-9.5]},
    {n:'shop_east',  pos:[55.0,1.6,-9.5],   look:[63.1,1.6,-9.5]},
    {n:'market',     pos:[-30.2,1.8,8.0],   look:[-30.2,1.6,-6.0]},
    {n:'fair',       pos:[13.0,1.8,28.0],   look:[13.0,1.4,22.0]}
  ];
  for(const s of spots){
    await p.evaluate(o=>{
      const {camera,XM}=window.__PROBE;
      XM.shot('shops');
      camera.position.set(o.pos[0],o.pos[1],o.pos[2]);
      camera.lookAt(o.look[0],o.look[1],o.look[2]);
      camera.updateMatrixWorld(true);
      camera.matrixAutoUpdate=false;camera.matrixWorldAutoUpdate=false;
    },s);
    await p.waitForTimeout(2500);
    for(let k=0;k<2;k++){
      await p.screenshot({path:`/tmp/look_${s.n}_${k}.png`});
      await p.waitForTimeout(700);
    }
    console.log('shot',s.n);
  }
  await b.close();
})();
