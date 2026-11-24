/* 射线取样（接管相机，避免导演机位覆盖） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const POS = JSON.parse(process.argv[3] || '[-3.4,6.6,-24]');
const LOOK = JSON.parse(process.argv[4] || '[-3.4,2.0,-30.1]');
const PTS = JSON.parse(process.argv[5] || '[[500,220],[600,260],[450,300]]');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1280,height:800}, deviceScaleFactor:1})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE && window.__PROBE.SK, { timeout:120000 });
  await p.waitForTimeout(8000);
  const out = await p.evaluate(([POS,LOOK,PTS]) => {
    const P=window.__PROBE, T=window.__THREE;
    const cam=P.camera;
    const tmp=new T.Vector3();
    const origCopy=cam.position.copy.bind(cam.position), origLook=cam.lookAt.bind(cam);
    cam.position.copy=(v)=>origCopy(tmp.set(POS[0],POS[1],POS[2]));
    cam.lookAt=(x,y,z)=>origLook(LOOK[0],LOOK[1],LOOK[2]);
    cam.fov=52; cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const rc=new T.Raycaster();
    const res=[];
    for(const [sx,sy] of PTS){
      const nd=new T.Vector2((sx/1280)*2-1, -(sy/800)*2+1);
      rc.setFromCamera(nd,cam);
      const hits=rc.intersectObject(P.scene,true)
        .filter(h=>h.object.visible&&h.object.material&&h.object.material.type!=='ShaderMaterial'
                  &&!h.object.isPoints&&!h.object.isLine&&h.object.material.opacity!==0);
      if(!hits.length){res.push({px:[sx,sy],hit:'none'});continue;}
      const h=hits[0],m=h.object.material;
      res.push({px:[sx,sy],mat:m.type,color:m.color?'#'+m.color.getHexString():'-',
        map:m.map?(m.map.image?m.map.image.width+'x'+m.map.image.height:'?'):'-',
        emis:m.emissive?'#'+m.emissive.getHexString()+'@'+m.emissiveIntensity:'-',
        dist:+h.distance.toFixed(2), pt:[+h.point.x.toFixed(2),+h.point.y.toFixed(2),+h.point.z.toFixed(2)]});
    }
    return res;
  }, [POS,LOOK,PTS]);
  out.forEach(r=>console.log(JSON.stringify(r)));
  await b.close();
})();
