/* ══════════════════════════════════════════════════════════════════════
   游乐场经济系统
   ── 雪币钱包：每个设施都收票价，钱不够上不去
   ── 固定上车光点：每个设施门口一圈发光光点，站进去才让上
   ── 打工：售票处卖票 / 摄影摊给小熊拍照 / 礼物包装台包礼物
   ══════════════════════════════════════════════════════════════════════ */
const ECON={coin:60,earned:0,spent:0,shots:0,good:0,jobCd:0,ticketBuyer:null};
/* 设施表：id / 名字 / 票价 / 上车光点坐标 / 光点颜色 */
const ECON_RIDES=[
  {id:'wheel',   name:'敞篷观景摩天轮',price:25,x:27.0,z:43.8,color:0x74e2ff},
  {id:'carousel',name:'皇家圣诞旋转木马',price:15,x:4.2,z:38.4,color:0xffc36a},
  {id:'bumper',  name:'沥青场地碰碰车',  price:20,x:-8.0,z:45.0,color:0x9dff8a},
  {id:'coaster', name:'星夜极光云霄飞车',price:40,x:-8.4,z:19.8,color:0xc49dff},
  {id:'launch',  name:'圣诞高空弹射跳伞',price:30,x:33.8,z:52.2,color:0x8ad8ff},
  {id:'heli',    name:'园区观光直升机',  price:60,x:45.4,z:50.5,color:0xffd08a},
  {id:'balloon', name:'大号热气球',      price:50,x:-49.0,z:51.0,color:0xff9fb8},
  {id:'train',   name:'皇家冬夜加长特快',price:10,x:66.0,z:34.0,color:0x8affc8},
];
/* 打工位：bx/bz = 摊位位置；gx/gz = 玩家站的工位光点（摊位正前方） */
const ECON_JOBS=[
  {id:'ticket',name:'游乐园售票处',pay:6,bx:13.6,bz:27.8,gx:13.6,gz:25.2,color:0xffd27a,tip:'卖一张门票'},
  {id:'photo', name:'圣诞摄影摊',  pay:25,bx:19.8,bz:30.8,gx:19.8,gz:28.0,color:0xffb0d0,tip:'开张，给小熊拍照'},
  {id:'wrap',  name:'礼物包装台',  pay:12,bx:12.4,bz:34.8,gx:12.4,gz:32.2,color:0x9ff0c0,tip:'包一份圣诞礼物'},
];
const ECON_PAD_R=2.55;          // 光点触发半径（米）
const ECON_JOB_R=3.30;          // 工位触发半径
const ECON_PHOTO_SPOT=[19.8,25.2];  // 摄影位：客人站的地方

/* ── 钱包 UI ───────────────────────────────────────────── */
const econCoinEl=document.getElementById('w-coin');
const econSubEl=document.getElementById('w-sub');
const photoHudEl=document.getElementById('photo-hud');
const phStateEl=document.getElementById('ph-state');
const phFlashEl=document.getElementById('photo-flash');
function econPaint(){
  if(econCoinEl)econCoinEl.textContent=String(ECON.coin);
  if(econSubEl)econSubEl.textContent='打工 +'+ECON.earned;
}
function econPay(n){ECON.coin-=n;ECON.spent+=n;econPaint();}

/* ── 飘字（+N 雪币）──────────────────────────────────────── */
const econFloats=[];
function econFloat(txt,color){
  const c=document.createElement('canvas');c.width=256;c.height=96;
  const x=c.getContext('2d');
  x.font='800 52px "PingFang SC",system-ui,sans-serif';
  x.textAlign='center';x.textBaseline='middle';
  x.shadowColor='rgba(0,0,0,.8)';x.shadowBlur=16;
  x.fillStyle='#'+color.toString(16).padStart(6,'0');
  x.fillText(txt,128,48);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  sp.scale.set(1.7,.64,1);sp.renderOrder=999;
  sp.position.set(fp.x+(Math.random()-.5)*.6,(fp.on?fp.y:0)+1.9,fp.z);
  scene.add(sp);
  econFloats.push({sp,life:0});
}
function econGain(n,why){
  ECON.coin+=n;ECON.earned+=n;econPaint();
  econFloat('+'+n,0xffd98a);
  sfx.blip(1180,.10,.07);
  if(why)_recMsg(why+'  +'+n+' 雪币',2000);
}

/* ── 圆角矩形（canvas 通用）──────────────────────────────── */
function econRoundRect(x,px,py,w,h,r){
  x.beginPath();
  x.moveTo(px+r,py);x.lineTo(px+w-r,py);x.arcTo(px+w,py,px+w,py+r,r);
  x.lineTo(px+w,py+h-r);x.arcTo(px+w,py+h,px+w-r,py+h,r);
  x.lineTo(px+r,py+h);x.arcTo(px,py+h,px,py+h-r,r);
  x.lineTo(px,py+r);x.arcTo(px,py,px+r,py,r);x.closePath();
}
/* 标牌：设施名 + 票价 / 工位名 + 报酬 */
function econSign(title,sub,color){
  const W=512,H=176;
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d');
  x.fillStyle='rgba(8,16,24,.88)';
  econRoundRect(x,6,6,W-12,H-12,26);x.fill();
  x.strokeStyle='rgba(244,197,106,.8)';x.lineWidth=5;x.stroke();
  x.textAlign='center';x.textBaseline='alphabetic';
  x.fillStyle='#eaf4ff';x.font='700 50px "PingFang SC",system-ui,sans-serif';
  x.fillText(title,W/2,70);
  x.fillStyle='#'+color.toString(16).padStart(6,'0');
  x.font='800 46px "PingFang SC",system-ui,sans-serif';
  x.fillText(sub,W/2,130);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true,transparent:true}));
  sp.scale.set(2.95,1.02,1);
  sp.userData.keep=true;
  return sp;
}

/* ── 光点几何：地面环 + 光池 + 竖向光柱 + 标牌 ─────────── */
const ECON_PADS=[];
function econMakePad(x,z,title,sub,color,radius,isJob){
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  const ring=new THREE.Mesh(new THREE.RingGeometry(radius*.66,radius*.84,44),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,
      blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.035;ring.renderOrder=3;ring.castShadow=false;
  g.add(ring);
  const pool=new THREE.Mesh(new THREE.PlaneGeometry(radius*3.4,radius*3.4),
    new THREE.MeshBasicMaterial({map:glowTex,color,transparent:true,opacity:.26,
      blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  pool.rotation.x=-Math.PI/2;pool.position.y=.022;pool.renderOrder=2;pool.castShadow=false;
  g.add(pool);
  /* 光柱：细、低透明度，只用来在远处提示「这里能上车」，不做大面积泛光 */
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(radius*.48,radius*.48,3.2,18,1,true),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:.09,
      blending:THREE.AdditiveBlending,depthWrite:false,fog:false,side:THREE.DoubleSide}));
  beam.position.y=1.6;beam.renderOrder=3;beam.castShadow=false;
  g.add(beam);
  const sign=econSign(title,sub,color);
  sign.position.set(0,isJob?2.55:2.75,0);
  g.add(sign);
  const p={g,ring,pool,beam,sign,x,z,isJob};
  ECON_PADS.push(p);
  return p;
}

/* ── 建摊位（复用场内木构摊的做法，跟小吃街同一套标准）── */
function econBuildStall(o){
  const g=SK.stallHouse(fair,{x:o.bx,z:o.bz,rot:Math.PI,cn:o.name,en:'XM',
    h:o.h,w:o.w,d:o.d,goods:o.goods||null,fab:o.fab,accent:o.accent,hang:null});
  OUTDOOR_OBS.push([o.bx,o.bz,1.9]);
  return g;
}
/* 极光雪山背景板：给来拍照的小熊当背景 */
function econBackdrop(x,z){
  const c=document.createElement('canvas');c.width=512;c.height=384;
  const x2=c.getContext('2d');
  const sky=x2.createLinearGradient(0,0,0,384);
  sky.addColorStop(0,'#0b1a33');sky.addColorStop(.55,'#16325c');sky.addColorStop(1,'#2a4a78');
  x2.fillStyle=sky;x2.fillRect(0,0,512,384);
  for(let i=0;i<5;i++){
    const ax=40+i*110+R(-20,20),ay=R(70,190);
    x2.strokeStyle='rgba(120,240,210,'+(.16+R(.08,.18)).toFixed(2)+')';
    x2.lineWidth=R(14,34);x2.beginPath();
    x2.moveTo(ax-90,ay+70);x2.quadraticCurveTo(ax,ay-50,ax+90,ay+70);x2.stroke();
  }
  x2.fillStyle='rgba(235,245,255,.92)';
  x2.beginPath();x2.moveTo(0,384);
  x2.lineTo(120,236);x2.lineTo(214,318);x2.lineTo(300,258);x2.lineTo(512,384);x2.closePath();x2.fill();
  x2.fillStyle='rgba(180,205,235,.9)';
  x2.beginPath();x2.moveTo(0,384);x2.lineTo(96,286);x2.lineTo(206,352);x2.lineTo(330,300);x2.lineTo(512,384);x2.closePath();x2.fill();
  x2.fillStyle='rgba(255,235,190,.95)';
  for(let i=0;i<26;i++){const sx=R(10,502),sy=R(20,200);x2.beginPath();x2.arc(sx,sy,R(1,2.6),0,6.3);x2.fill();}
  x2.fillStyle='rgba(255,255,255,.88)';
  x2.font='700 30px "PingFang SC",system-ui,sans-serif';x2.textAlign='center';
  x2.fillText('CHRISTMAS 2026',256,60);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const p=new THREE.Mesh(new THREE.PlaneGeometry(3.2,2.4),
    new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
  p.position.set(x,1.55,z);p.rotation.y=Math.PI;
  scene.add(p);
  /* 背板支架 */
  for(const sx of [-1,1]){
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,2.3,8),
      new THREE.MeshStandardMaterial({color:0x8a6a44,roughness:.8}));
    leg.position.set(x+sx*1.4,1.1,z+.12);scene.add(leg);
  }
  return p;
}
/* 三脚架 + 相机 */
function econCameraProp(x,z){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=Math.PI;scene.add(g);
  const darkM=new THREE.MeshStandardMaterial({color:0x232a33,roughness:.5,metalness:.5});
  const chromeM=new THREE.MeshStandardMaterial({color:0xb9c4cf,roughness:.28,metalness:.85});
  for(let i=0;i<3;i++){
    const a=(i/3)*Math.PI*2+.4;
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,1.45,6),darkM);
    leg.position.set(Math.cos(a)*.28,.72,Math.sin(a)*.28);
    leg.rotation.z=-Math.cos(a)*.36;leg.rotation.x=Math.sin(a)*.36;
    g.add(leg);
  }
  const body=new THREE.Mesh(new THREE.BoxGeometry(.44,.30,.26),darkM);
  body.position.y=1.5;g.add(body);
  const lens=new THREE.Mesh(new THREE.CylinderGeometry(.13,.15,.28,14),chromeM);
  lens.rotation.x=Math.PI/2;lens.position.set(0,1.5,.24);g.add(lens);
  const hood=new THREE.Mesh(new THREE.BoxGeometry(.40,.10,.34),darkM);
  hood.position.set(0,1.68,.16);g.add(hood);
  const led=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),
    new THREE.MeshBasicMaterial({color:0xff5a4a}));
  led.position.set(.17,1.62,-.10);g.add(led);
  return g;
}

/* ── 建全部设施 ─────────────────────────────────────────── */
function econBuildAll(){
  for(const R of ECON_RIDES){
    econMakePad(R.x,R.z,R.name,R.price+' 雪币',R.color,ECON_PAD_R,false);
  }
  /* 打工摊位 */
  const stalls=[];
  stalls.push(econBuildStall({bx:ECON_JOBS[0].bx,bz:ECON_JOBS[0].bz,name:'游乐园售票处',
    h:3.05,w:3.9,d:2.6,fab:9,accent:'#2f6b8a'}));
  /* 售票亭：柜台上放一摞票 + 钱匣 */
  {
    const g=stalls[0];
    const paperM=new THREE.MeshStandardMaterial({color:0xf6f1e2,roughness:.85});
    for(let i=0;i<6;i++){
      const t=new THREE.Mesh(new THREE.BoxGeometry(.34,.02,.22),paperM);
      t.position.set(-.9+i*.05,1.08+i*.022,.44);t.rotation.y=.2-i*.05;g.add(t);
    }
    const boxM=new THREE.MeshStandardMaterial({color:0x6b4a2e,roughness:.7});
    const box=new THREE.Mesh(new THREE.BoxGeometry(.52,.22,.36),boxM);
    box.position.set(.85,1.15,.44);g.add(box);
    const slot=new THREE.Mesh(new THREE.BoxGeometry(.30,.03,.05),
      new THREE.MeshBasicMaterial({color:0x111820}));
    slot.position.set(.85,1.27,.44);g.add(slot);
  }
  /* 摄影摊 */
  stalls.push(econBuildStall({bx:ECON_JOBS[1].bx,bz:ECON_JOBS[1].bz,name:'圣诞摄影摊',
    h:2.95,w:3.6,d:2.5,fab:11,accent:'#3f6ba8'}));
  {
    const g=stalls[1];
    const rollM=new THREE.MeshStandardMaterial({color:0x22262c,roughness:.6,metalness:.3});
    const roll=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.26,14),rollM);
    roll.rotation.z=Math.PI/2;roll.position.set(-.85,1.14,.42);g.add(roll);
    const fl=new THREE.Mesh(new THREE.BoxGeometry(.30,.02,.26),
      new THREE.MeshStandardMaterial({color:0xf2f0e6,roughness:.9}));
    fl.position.set(-.85,1.13,.62);fl.rotation.x=.3;g.add(fl);
  }
  econCameraProp(ECON_JOBS[1].gx+1.5,ECON_JOBS[1].gz-.4);
  econBackdrop(ECON_PHOTO_SPOT[0],ECON_PHOTO_SPOT[1]-1.35);
  /* 礼物包装台 */
  stalls.push(econBuildStall({bx:ECON_JOBS[2].bx,bz:ECON_JOBS[2].bz,name:'礼物包装台',
    h:2.75,w:3.2,d:2.4,fab:3,accent:'#2f8f6b',goods:'gift'}));
  {
    const g=stalls[2];
    const spool=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.20,14),
      new THREE.MeshStandardMaterial({color:0xd23b32,roughness:.6}));
    spool.rotation.z=Math.PI/2;spool.position.set(.78,1.14,.42);g.add(spool);
    const spool2=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.20,14),
      new THREE.MeshStandardMaterial({color:0xe8c24a,roughness:.6}));
    spool2.rotation.z=Math.PI/2;spool2.position.set(.78,1.14,.68);g.add(spool2);
  }
  /* 工位光点 */
  for(const J of ECON_JOBS){
    econMakePad(J.gx,J.gz,J.name,'打工 +'+J.pay,J.color,2.35,true);
  }
  econPaint();
}

/* ── 查询 ───────────────────────────────────────────────── */
function econRideById(id){for(const r of ECON_RIDES)if(r.id===id)return r;return null;}
function econRideByKind(kind){
  if(kind==='wheel')return econRideById('wheel');
  if(kind==='carousel')return econRideById('carousel');
  if(kind==='bumper')return econRideById('bumper');
  if(kind==='coaster')return econRideById('coaster');
  if(kind==='launch')return econRideById('launch');
  if(kind==='heli')return econRideById('heli');
  if(kind==='balloon')return econRideById('balloon');
  if(kind==='sleigh')return {id:'sleigh',name:'空中圣诞驯鹿雪橇',price:30,color:0xffd08a};
  return null;
}
function econAtPad(id){
  if(!fp.on)return false;
  const R=econRideById(id);
  if(!R)return false;
  return Math.hypot(fp.x-R.x,fp.z-R.z)<ECON_PAD_R+1.1;
}
function econNearestPad(){
  if(!fp.on)return null;
  let best=null,bd=1e9;
  for(const R of ECON_RIDES){
    const d=Math.hypot(fp.x-R.x,fp.z-R.z);
    if(d<ECON_PAD_R&&d<bd){bd=d;best=R;}
  }
  return best;
}
function econNearestJob(){
  if(!fp.on)return null;
  let best=null,bd=1e9;
  for(const J of ECON_JOBS){
    const d=Math.hypot(fp.x-J.gx,fp.z-J.gz);
    if(d<ECON_JOB_R&&d<bd){bd=d;best=J;}
  }
  return best;
}

/* ── 上车（扣钱 + 真的坐上去）───────────────────────────── */
function econBoard(id){
  const R=econRideById(id);
  if(!R)return false;
  if(id==='train'){
    const near=trainCars.some(c=>Math.hypot(fp.x-c.position.x,fp.z-c.position.z)<13);
    if(!near){_recMsg('小火车还没到站，在光点上等一会儿',2400);sfx.blip(300,.14,.08);return false;}
  }
  if(ECON.coin<R.price){
    _recMsg('雪币不够：'+R.name+' 票价 '+R.price+' 雪币，还差 '+(R.price-ECON.coin)+' 枚',2800);
    sfx.blip(300,.16,.09);return false;
  }
  econPay(R.price);
  switch(id){
    case 'wheel':toggleRideWheel(null);break;
    case 'carousel':toggleRideFacility({kind:'carousel',label:'皇家圣诞旋转木马'});break;
    case 'bumper':toggleRideFacility({kind:'bumper',car:amusement.bumper[0],label:'沥青场地碰碰车'});break;
    case 'coaster':toggleRideFacility({kind:'coaster',label:'星夜极光云霄飞车'});break;
    case 'launch':startLaunchRide();break;
    case 'heli':toggleHeliRide();break;
    case 'balloon':{
      let bi=0;
      for(let i=0;i<balloons.length;i++){
        if(Math.hypot(balloons[i].x-ECON_RIDES[6].x,balloons[i].z-ECON_RIDES[6].z)<9){bi=i;break;}
      }
      toggleBalloonRide(bi);break;
    }
    case 'train':toggleRideTrain();break;
  }
  _recMsg(R.name+' · 已付 '+R.price+' 雪币',1900);
  return true;
}

/* ── NPC 调度：叫一个小熊过来排队 / 站到摄影位 ─────────── */
function econPickNpc(cx,cz,minD,maxD){
  let best=null,bs=-1;
  for(const n of npcs){
    if(n.indoor||n.job)continue;
    const d=Math.hypot(n.p.position.x-cx,n.p.position.z-cz);
    if(d<minD||d>maxD)continue;
    const s=1/(1+d*0.06);
    if(s>bs){bs=s;best=n;}
  }
  return best;
}
function econSendNpc(n,x,z){
  n._oldPath=n.path;n._oldI=n.i;n._oldSpeed=n.speed;
  n.path=[[x,n.baseY,z]];n.i=0;n.wait=0;n.look=null;n.speed=1.45;
}
function econFreeNpc(n){
  if(n._oldPath){n.path=n._oldPath;n.i=n._oldI;}
  if(n._oldSpeed)n.speed=n._oldSpeed;
  n._oldPath=null;n.job=null;n.wait=R(.2,1.4);
}

/* ── 打工 ①：售票处卖票 ────────────────────────────────── */
function econSellTicket(){
  if(ECON.jobCd>0)return;
  const J=ECON_JOBS[0];
  if(ECON.ticketBuyer){_recMsg('客人正在赶来，稍等一下',1800);return;}
  const n=econPickNpc(J.bx,J.bz,7,30);
  if(!n){_recMsg('附近没有小熊来买票，过一会儿再来',2400);return;}
  econSendNpc(n,J.gx,J.gz+.4);
  n.job={type:'ticket',x:J.gx,z:J.gz+.4,t:0};
  ECON.ticketBuyer=n;
  _recMsg('客人朝售票处走来了…',1800);
  sfx.blip(760,.10,.07);
}

/* ── 打工 ②：摄影摊 ───────────────────────────────────── */
const photoSys={on:false,npc:null,cool:0,wait:0,aimed:false,shots:0};
function econPhotoStart(){
  if(photoSys.on){econPhotoStop();return;}
  if(!fp.on)enterWalk();
  photoSys.on=true;photoSys.npc=null;photoSys.cool=0;photoSys.wait=0;photoSys.aimed=false;
  if(photoHudEl)photoHudEl.classList.add('show');
  if(phStateEl)phStateEl.textContent='等客人走过来…';
  _recMsg('摄影摊开张：等小熊站到位置上，把视线对准他，按 空格 拍照',3600);
  sfx.blip(880,.12,.07);
}
function econPhotoStop(){
  if(!photoSys.on)return;
  if(photoSys.npc)econFreeNpc(photoSys.npc);
  photoSys.on=false;photoSys.npc=null;photoSys.aimed=false;
  if(photoHudEl)photoHudEl.classList.remove('show');
  hudHide();
}
function econPhotoShoot(){
  if(!photoSys.on||photoSys.cool>0)return;
  const n=photoSys.npc;
  if(!n){_recMsg('还没有客人站到位置上，再等等',2000);return;}
  const dx=n.p.position.x-camera.position.x, dz=n.p.position.z-camera.position.z;
  const dist=Math.hypot(dx,dz);
  const cy=camera.rotation.y;
  const fx=-Math.sin(cy), fz=-Math.cos(cy);
  const dot=(dx*fx+dz*fz)/Math.max(.001,dist);
  const ang=Math.acos(Math.min(1,Math.max(-1,dot)));
  photoSys.cool=.8;
  /* 闪光 */
  if(phFlashEl){phFlashEl.classList.remove('on');void phFlashEl.offsetWidth;phFlashEl.classList.add('on');}
  sfx.blip(1560,.09,.10);
  if(ang<.44&&dist<16){
    const good=(dist>2.4&&dist<11);
    const pay=good?25:14;
    ECON.shots++;if(good)ECON.good++;
    n.happyT=1.8;n.vy=3.0;n.squash=-.22;
    econGain(pay,good?'构图完美，客人很满意':'照片有点歪，但客人还是笑了');
    photoSys.shots++;
    econFreeNpc(n);photoSys.npc=null;photoSys.wait=1.2;
    if(phStateEl)phStateEl.textContent='拍好一张，等下一位客人…';
  }else{
    _recMsg('没对准，小熊笑着跑开了，再来一次',2200);
    econFreeNpc(n);photoSys.npc=null;photoSys.wait=1.2;
    if(phStateEl)phStateEl.textContent='没对准，等下一位客人…';
  }
}

/* ── 打工 ③：礼物包装台 ────────────────────────────────── */
const econWrapBox={g:null,t:0,on:false};
function econWrapGift(){
  if(ECON.jobCd>0)return;
  ECON.jobCd=1.1;
  econGain(12,'包好一份圣诞礼物');
  if(econWrapBox.g){econWrapBox.on=true;econWrapBox.t=0;}
}
function econBuildWrapBox(){
  const J=ECON_JOBS[2];
  const g=new THREE.Group();g.position.set(J.bx,J.bz,0);g.rotation.y=Math.PI;scene.add(g);
  const redM=new THREE.MeshStandardMaterial({color:0xd23b32,roughness:.55});
  const whiteM=new THREE.MeshStandardMaterial({color:0xf2f0e6,roughness:.6});
  const box=new THREE.Mesh(new THREE.BoxGeometry(.42,.36,.42),redM);
  box.position.set(.95,1.30,.42);g.add(box);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(.44,.07,.44),whiteM);
  lid.position.set(.95,1.51,.42);g.add(lid);
  const rb=new THREE.Mesh(new THREE.BoxGeometry(.07,.38,.44),whiteM);
  rb.position.set(.95,1.30,.42);g.add(rb);
  g.scale.setScalar(.001);g.visible=false;
  econWrapBox.g=g;
}

/* ── 每帧更新 ───────────────────────────────────────────── */
let econLastPrompt='',econLastMsg='';
function econUpdate(dt){
  ECON.jobCd=Math.max(0,ECON.jobCd-dt);
  /* 飘字 */
  for(let i=econFloats.length-1;i>=0;i--){
    const f=econFloats[i];f.life+=dt;
    f.sp.position.y+=dt*.85;
    f.sp.material.opacity=Math.max(0,1-f.life/1.3);
    if(f.life>1.3){
      scene.remove(f.sp);
      if(f.sp.material.map)f.sp.material.map.dispose();
      f.sp.material.dispose();econFloats.splice(i,1);
    }
  }
  /* 包装台上的礼物盒：长出来 → 停一下 → 收走 */
  if(econWrapBox.on&&econWrapBox.g){
    econWrapBox.t+=dt;
    const s=econWrapBox.t<.34?econWrapBox.t/.34:(econWrapBox.t<1.5?1:Math.max(.001,1-(econWrapBox.t-1.5)/.3));
    econWrapBox.g.visible=s>.02;
    econWrapBox.g.scale.setScalar(Math.max(.001,s));
    if(econWrapBox.t>1.85){econWrapBox.on=false;econWrapBox.g.visible=false;}
  }
  /* 光点呼吸：夜里最亮，白天压暗 */
  const night=Math.sin(((state.hour-6)/12)*Math.PI)<=0.03;
  const k=night?1:.32;
  for(const p of ECON_PADS){
    p.ring.material.opacity=(.30+.13*Math.sin(t*2.3+p.x))*(night?1:.42);
    p.beam.material.opacity=(.055+.025*Math.sin(t*1.6+p.z))*(night?1:.4);
    p.pool.material.opacity=(.15+.06*Math.sin(t*2.0+p.x))*k;
  }
  /* 买票的客人走到窗口就成交 */
  if(ECON.ticketBuyer){
    const n=ECON.ticketBuyer;
    n.job.t+=dt;
    const d=Math.hypot(n.p.position.x-n.job.x,n.p.position.z-n.job.z);
    if(d<1.5){
      ECON.ticketBuyer=null;
      n.happyT=1.6;n.vy=2.8;n.squash=-.22;
      econGain(ECON_JOBS[0].pay,'卖出 1 张门票');
      econFreeNpc(n);
    }else if(n.job.t>26){
      ECON.ticketBuyer=null;econFreeNpc(n);
      _recMsg('客人等太久走了，改天再来',2000);
    }
  }
  if(!fp.on)return;
  if(photoSys.on){
    /* 摄影模式：找客人 + 判断有没有对准 */
    if(photoSys.npc){
      const n=photoSys.npc;
      n.look=[fp.x,fp.z];
      const dx=n.p.position.x-camera.position.x, dz=n.p.position.z-camera.position.z;
      const dist=Math.hypot(dx,dz);
      const cy=camera.rotation.y;
      const dot=(dx*(-Math.sin(cy))+dz*(-Math.cos(cy)))/Math.max(.001,dist);
      const ang=Math.acos(Math.min(1,Math.max(-1,dot)));
      photoSys.aimed=(ang<.44&&dist<16);
      if(phStateEl)phStateEl.textContent=photoSys.aimed
        ?'对准了！按 空格 拍照（'+dist.toFixed(1)+'m）'
        :'客人站好了 · 把视线移过去对准他';
    }else{
      photoSys.wait-=dt;
      if(photoSys.wait<=0&&!ECON.ticketBuyer){
        const n=econPickNpc(fp.x,fp.z,8,32);
        if(n){
          econSendNpc(n,ECON_PHOTO_SPOT[0],ECON_PHOTO_SPOT[1]);
          n.job={type:'photo',x:ECON_PHOTO_SPOT[0],z:ECON_PHOTO_SPOT[1],t:0};
          photoSys.npc=n;
          photoSys.wait=3;
          if(phStateEl)phStateEl.textContent='客人正朝摄影位走过来…';
        }else{
          photoSys.wait=2;
          if(phStateEl)phStateEl.textContent='附近没人，等一会儿…';
        }
      }
    }
    /* 走远了就收摊 */
    if(Math.hypot(fp.x-ECON_JOBS[1].gx,fp.z-ECON_JOBS[1].gz)>9)econPhotoStop();
    return;
  }
  if(wheelSys.riding||trainSys.riding||launchSys.active||heliSys.riding||balloonSys.riding)return;
  /* 提示：工位优先，其次上车光点 */
  const job=econNearestJob();
  const pad=econNearestPad();
  let key='',msg='',btn='',fn=null;
  if(job){
    key='job:'+job.id;
    msg=job.name+' · '+job.tip+'（'+job.pay+' 雪币）';
    btn='开工 (E)';
    fn=()=>econJobDo(job.id);
  }else if(pad){
    key='pad:'+pad.id;
    msg=pad.id==='train'
      ?'皇家冬夜加长特快 · 票价 10 雪币 · 在光点上等车，小火车进站后按 E 上车'
      :pad.name+' · 票价 '+pad.price+' 雪币 · 按 E 上车';
    btn='上车 ('+pad.price+')';
    fn=()=>econBoard(pad.id);
  }
  econSetPrompt(key,msg,btn,fn);
}
/* 提示条是全局共用的（钢琴 / 马戏团 / 溜冰场也在用）。
   只有「提示条上还是我自己那条」时才收走，别把别人的提示抹掉。 */
function econSetPrompt(key,msg,btn,fn){
  if(key===econLastPrompt){
    if(fn&&key)trainBtnEl.onclick=fn;
    return;
  }
  const prevMsg=econLastMsg;
  econLastPrompt=key;econLastMsg=msg;
  if(key){hudShow(msg,btn,fn);}
  else if(trainMsgEl.textContent===prevMsg){hudHide();}
}
function econJobDo(id){
  if(id==='ticket')econSellTicket();
  else if(id==='photo')econPhotoStart();
  else if(id==='wrap')econWrapGift();
}
