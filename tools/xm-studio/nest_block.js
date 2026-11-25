{
  /* ══ 2.5 国家体育场「鸟巢」· 按真实比例形态还原 ══
     原贵州大学花溪校区（图书馆 / 体育馆 / 游泳馆 / 人工湖 / 宿舍 / 食堂）整片拆掉，
     北片只剩这一座鸟巢。
     真实国家体育场（2008 奥运主场）的关键尺寸：
       长轴（南北）330m、短轴（东西）300m，屋面最高 69m 在南北两端、东西侧约 50m，
       顶部椭圆天窗约 180×120m。
     本场景整体是缩微的，所以鸟巢按同样的比例关系缩到园区能容纳的最大：
       长轴 96m × 短轴 87.3m × 高 20.1m（严格 330 : 300 : 69）
     形态按真实还原的四个要点：
       ① 马鞍形屋面 —— 南北两端高、东西两侧低，不是平顶圆筒
       ② 24 根巨型格构主支撑柱从碗沿外侧斜向内上撑起（伞骨）
       ③ 次级钢梁是真几何体：双向斜交编织成菱形网（不是贴图网面，远看像纱窗）
       ④ 顶部椭圆天窗：南北半轴 26m、东西半轴 17.4m（= 真实 180×120m 的同比例） */
  const NEST={cx:0,cz:-100,A:48,B:43.6,yRim:9.0,yTopN:20.0,yTopE:14.5};
  const nest=new THREE.Group();
  nest.userData.tag='nest';nest.position.set(NEST.cx,0,NEST.cz);scene.add(nest);

  /* 参数曲线：rN/rE 是南北 / 东西两个方向的半径系数，fH 是高度进度 */
  const curveAt=(tbl,v)=>{
    for(let i=0;i<tbl.length-1;i++){
      if(v>=tbl[i][0]&&v<=tbl[i+1][0]){
        const t=(v-tbl[i][0])/(tbl[i+1][0]-tbl[i][0]);
        return tbl[i][1]+(tbl[i+1][1]-tbl[i][1])*t;
      }
    }
    return tbl[tbl.length-1][1];
  };
  const rN=v=>curveAt([[0,1],[0.30,1.085],[0.62,0.920],[1,0.542]],v);
  const rE=v=>curveAt([[0,1],[0.30,1.120],[0.62,0.880],[1,0.400]],v);
  const fH =v=>curveAt([[0,0],[0.35,0.42],[0.70,0.78],[1,1]],v);
  /* 屋面高度：马鞍 —— 南北端 yTopN，东西侧 yTopE */
  const nestY=(a,v)=>NEST.yRim+fH(v)*((NEST.yTopE-NEST.yRim)+(NEST.yTopN-NEST.yTopE)*Math.sin(a)*Math.sin(a));
  const nestP=(a,v,out)=>out.set(Math.cos(a)*NEST.B*rE(v),nestY(a,v),Math.sin(a)*NEST.A*rN(v));

  /* 确定性伪随机：钢梁的随机扰动要可复现，不能吃全局 rng 的状态顺序 */
  const nhash=(n)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};

  /* 椭圆环带（水平面）：内椭圆 aIn×bIn → 外椭圆 aOut×bOut */
  const ellipseBand=(aIn,bIn,aOut,bOut,seg)=>{
    const sh=new THREE.Shape();
    sh.absellipse(0,0,aOut,bOut,0,Math.PI*2,false);
    const hole=new THREE.Path();
    hole.absellipse(0,0,aIn,bIn,0,Math.PI*2,true);
    sh.holes.push(hole);
    const g=new THREE.ShapeGeometry(sh,seg);
    g.rotateX(-Math.PI/2);g.computeVertexNormals();
    return g;
  };
  /* 椭圆竖直裙边（看台踢面） */
  const ellipseWall=(a,b,y0,y1,seg)=>{
    const pos=[],idx=[];
    for(let i=0;i<=seg;i++){
      const t=i/seg,ang=t*Math.PI*2,c=Math.cos(ang),s=Math.sin(ang);
      pos.push(c*a,y0,s*b);pos.push(c*a,y1,s*b);
    }
    for(let i=0;i<seg;i++){const o=i*2;idx.push(o,o+2,o+1,o+1,o+2,o+3);}
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setIndex(idx);g.computeVertexNormals();
    return g;
  };

  /* ── 碗形看台：18 级台阶 + 踢面 + 红座椅带 ── */
  const N_STEP=18, R_IN_A=25.0, R_IN_B=18.4;
  const concM  =M(0x8b8880,{roughness:.92,side:THREE.DoubleSide});
  const seatM  =M(0x9e2b2c,{roughness:.84});
  const seatDM =M(0x565c64,{roughness:.86});
  for(let i=0;i<N_STEP;i++){
    const t0=i/N_STEP,t1=(i+1)/N_STEP;
    const a0=R_IN_A+(NEST.A-R_IN_A)*t0,a1=R_IN_A+(NEST.A-R_IN_A)*t1;
    const b0=R_IN_B+(NEST.B-R_IN_B)*t0,b1=R_IN_B+(NEST.B-R_IN_B)*t1;
    const y=.55+i*.50;
    const step=add(nest,ellipseBand(a0,b0,a1,b1,96),concM,0,y,0);
    step.castShadow=true;step.receiveShadow=true;
    /* 踢面：从本级踏面升到下一级，避免看台变成一片悬空的水平片 */
    const kick=add(nest,ellipseWall(a1,b1,y,y+.50,96),concM,0,0,0);
    kick.castShadow=false;kick.receiveShadow=true;
    /* 座椅带：每级台面上一条窄环，红为主、每三级一道深灰分区 */
    const sIn=.16,sOut=.84;
    const seat=add(nest,ellipseBand(a0+(a1-a0)*sIn,b0+(b1-b0)*sIn,
                                  a0+(a1-a0)*sOut,b0+(b1-b0)*sOut,96),
      (i%3===2)?seatDM:seatM,0,y+.055,0);
    seat.castShadow=false;seat.receiveShadow=true;
  }
  /* 碗沿顶部的雪环 + 混凝土压顶 */
  {
    const cap=add(nest,ellipseBand(NEST.A-.55,NEST.B-.55,NEST.A+.55,NEST.B+.55,96),
      M(0x9a968d,{roughness:.9}),0,NEST.yRim+.16,0);
    cap.castShadow=true;
    const snow=add(nest,ellipseBand(NEST.A-.42,NEST.B-.42,NEST.A+.42,NEST.B+.42,96),
      M(0xeef4f8,{roughness:.94}),0,NEST.yRim+.30,0);
    snow.castShadow=false;
  }

  /* ── 内场：红色塑胶跑道 + 草坪 + 白线 + 球门 ── */
  {
    const trk=new THREE.Mesh(ellipseBand(R_IN_A-3.8,R_IN_B-3.5,R_IN_A,R_IN_B,96),
      M(0xa8463a,{roughness:.9}));
    trk.position.set(0,.07,0);trk.receiveShadow=true;trk.castShadow=false;nest.add(trk);
    const grass=new THREE.Mesh(new THREE.CircleGeometry(1,72),M(0x4b6d40,{roughness:.95}));
    grass.rotation.x=-Math.PI/2;grass.scale.set(R_IN_A-3.8,R_IN_B-3.5,1);
    grass.position.set(0,.05,0);grass.receiveShadow=true;grass.castShadow=false;nest.add(grass);
    /* 草皮上的雪斑（冬天也不至于是一块死绿；雪斑别太大，否则像抽象白块） */
    for(let i=0;i<16;i++){
      const ang=nhash(i*17.3)*6.283,rr=.22+nhash(i*29.7)*.68;
      const sp=new THREE.Mesh(new THREE.CircleGeometry(1,16),M(0xeef4f8,{roughness:.94}));
      sp.rotation.x=-Math.PI/2;sp.scale.set(.8+nhash(i*41.1)*1.2,.6+nhash(i*53.3)*.8,1);
      sp.position.set(Math.cos(ang)*(R_IN_A-4.4)*rr,.10,Math.sin(ang)*(R_IN_B-4.0)*rr);
      sp.castShadow=false;sp.receiveShadow=false;nest.add(sp);
    }
    const white=M(0xf2eee6,{roughness:.72});
    const mid=new THREE.Mesh(new THREE.RingGeometry(2.55,2.74,44),white);
    mid.rotation.x=-Math.PI/2;mid.scale.set(1,(R_IN_B-3.6)/(R_IN_A-3.6),1);
    mid.position.set(0,.08,0);mid.castShadow=false;nest.add(mid);
    const ln=new THREE.Mesh(ellipseBand(R_IN_A-3.95,R_IN_B-3.65,R_IN_A-3.82,R_IN_B-3.52,96),white);
    ln.position.set(0,.09,0);ln.castShadow=false;nest.add(ln);
    /* 球门 */
    for(const s of [-1,1]){
      const gx=s*(R_IN_A-4.6);
      addNS(nest,BX(.16,2.6,.16),M(0xf6f6f4,{roughness:.5}),gx,1.3,-3.1);
      addNS(nest,BX(.16,2.6,.16),M(0xf6f6f4,{roughness:.5}),gx,1.3, 3.1);
      addNS(nest,BX(.16,.16,6.4),M(0xf6f6f4,{roughness:.5}),gx,2.6,0);
    }
  }

  /* ── 钢壳内衬膜：挡住视线，夜里透暖光（钢梁在外侧，缝里漏出膜的暖光）── */
  const nestFilmM=new THREE.MeshStandardMaterial({
    color:0x252c35,roughness:.88,metalness:.10,
    emissive:0xffb265,emissiveIntensity:.52,side:THREE.DoubleSide});
  GZU_EMI.push({m:nestFilmM,n:.52,d:.05});
  {
    const NU=112,NV=24,pos=[],uv=[],idx=[];
    for(let j=0;j<=NV;j++){
      const v=j/NV;
      for(let i=0;i<=NU;i++){
        const u=i/NU,a=u*Math.PI*2;
        const p=nestP(a,v,new THREE.Vector3());
        pos.push(p.x*.978,p.y,p.z*.978);uv.push(u,v);
      }
    }
    for(let j=0;j<NV;j++)for(let i=0;i<NU;i++){
      const a=j*(NU+1)+i,b=a+1,c=a+NU+1,d=c+1;
      idx.push(a,c,b,b,c,d);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);g.computeVertexNormals();
    const film=add(nest,g,nestFilmM,0,0,0);
    film.castShadow=false;film.receiveShadow=false;
  }

  /* ── 次级钢梁：真几何体，双向斜交编织 ──
     这是鸟巢的辨识度所在。真实鸟巢是上千根粗钢梁交错编成，
     远看是连续网面、近看是实打实的杆件 —— 贴图网面完全出不来这个效果。
     这里用 InstancedMesh：一根 BoxGeometry 缩放成千上万根梁，1 个 draw call。 */
  const nestSteelM=M(0xc4cad1,{roughness:.42,metalness:.58});
  const NL=12, NC=104;
  const RING_PER=4;
  const ROD_N=NL*NC*2 + NL*RING_PER + 24;
  const nestRod=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),nestSteelM,ROD_N);
  {
    const d=new THREE.Object3D(),p=new THREE.Vector3(),q=new THREE.Vector3();
    const dir=new THREE.Vector3(),AX=new THREE.Vector3(0,0,1),qq=new THREE.Quaternion();
    let k=0;
    /* 注意：不能用 d.lookAt(p2)。
       Object3D.lookAt 内部把目标当「世界坐标」处理，而这里的 p2 是鸟巢局部坐标
       （组在 z=-100），算出来的朝向会整体偏掉 —— 旧鸟巢的钢杆方向就是这么歪的。
       直接用四元数把局部 +Z 轴对齐方向向量，结果与坐标系无关。 */
    const put=(p1,p2,w)=>{
      const len=p1.distanceTo(p2);
      if(len<0.01)return;
      d.position.copy(p1).lerp(p2,.5);
      dir.subVectors(p2,p1).normalize();
      d.quaternion.setFromUnitVectors(AX,dir);
      d.scale.set(w,w,len);
      d.updateMatrix();
      nestRod.setMatrixAt(k++,d.matrix);
    };
    for(let L=0;L<NL;L++){
      const v0=0.035+L*0.0815;
      if(v0>0.90)break;
      for(let C=0;C<NC;C++){
        const u0=((C/NC)+(L*0.0431))%1;
        const a0=u0*Math.PI*2;
        /* 两组反斜向杆：交叉成菱形网 */
        for(const dir of [1,-1]){
          const j1=nhash(L*9973+C*31+dir*7),j2=nhash(L*131+L*9973+C*53+dir*11);
          const wob=(j1-.5)*0.022;                       /* 半径方向随机扰动 */
          const v1=Math.min(.975,v0+0.070+j2*0.012);
          const du=dir*(0.0285+j1*0.004);
          const a1=a0+du;
          nestP(a0,v0,p);nestP(a1,v1,q);
          const rr=1+wob;
          p.set(p.x*rr,p.y,p.z*rr);q.set(q.x*rr,q.y,q.z*rr);
          put(p,q,0.24+j1*0.07);
        }
      }
      /* 环向次梁：每层 4 段弧（水平环向，是屋面的第二道骨架） */
      for(let S=0;S<RING_PER;S++){
        const a0=(S/RING_PER)*Math.PI*2+ (L%2?0.04:0);
        const a1=((S+1)/RING_PER)*Math.PI*2;
        const v=v0+0.030;
        const SEG=8;
        for(let s=0;s<SEG;s++){
          const b0=a0+(a1-a0)*(s/SEG),b1=a0+(a1-a0)*((s+1)/SEG);
          const rr=0.984;
          nestP(b0,v,p);nestP(b1,v,q);
          p.set(p.x*rr,p.y,p.z*rr);q.set(q.x*rr,q.y,q.z*rr);
          put(p,q,0.30);
        }
      }
    }
    /* 竖向次梁：每 15° 一根，从碗沿直通天洞 */
    for(let s=0;s<24;s++){
      const a=s/24*Math.PI*2;
      const SEG=8;
      for(let i=0;i<SEG;i++){
        const v0=0.02+i*(0.96/SEG),v1=0.02+(i+1)*(0.96/SEG);
        const rr=0.992;
        nestP(a,v0,p);nestP(a,v1,q);
        p.set(p.x*rr,p.y,p.z*rr);q.set(q.x*rr,q.y,q.z*rr);
        put(p,q,0.34);
      }
    }
    nestRod.count=k;                      // 实际放了多少根就渲染多少根，别留空实例
    nestRod.instanceMatrix.needsUpdate=true;
  }
  nestRod.castShadow=false;nestRod.receiveShadow=false;nest.add(nestRod);

  /* ── 24 根主支撑格构柱：从碗沿外侧地面斜向内上撑住屋面（伞骨）── */
  {
    const CHORD=0.46, SPAN=1.95;      /* 角钢截面 / 柱截面边长 */
    const chords=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),nestSteelM,24*4);
    const lacing=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),nestSteelM,24*7);
    const d=new THREE.Object3D(),bot=new THREE.Vector3(),top=new THREE.Vector3();
    const ax=new THREE.Vector3(),u1=new THREE.Vector3(),u2=new THREE.Vector3(),tmp=new THREE.Vector3();
    const dir=new THREE.Vector3(),AX=new THREE.Vector3(0,0,1);
    let ci=0,li=0;
    for(let s=0;s<24;s++){
      const a=s/24*Math.PI*2;
      /* 柱脚：碗沿外侧的地面 */
      const rb=1.085;
      bot.set(Math.cos(a)*NEST.B*rE(0)*rb,1.0,Math.sin(a)*NEST.A*rN(0)*rb);
      /* 柱头：屋面 v=0.62 处 */
      const vt=0.62;
      nestP(a,vt,top);
      top.set(top.x*1.0,top.y,top.z*1.0);
      ax.subVectors(top,bot).normalize();
      tmp.set(0,1,0);
      if(Math.abs(ax.dot(tmp))>.94)tmp.set(1,0,0);
      u1.crossVectors(ax,tmp).normalize();
      u2.crossVectors(ax,u1).normalize();
      const corner=[[-1,-1],[1,-1],[1,1],[-1,1]];
      const pts=[];
      for(const [s1,s2] of corner){
        const p=new THREE.Vector3().copy(bot)
          .addScaledVector(u1,s1*SPAN/2).addScaledVector(u2,s2*SPAN/2);
        const q=new THREE.Vector3().copy(top)
          .addScaledVector(u1,s1*SPAN/2).addScaledVector(u2,s2*SPAN/2);
        pts.push([p,q]);
      }
      for(const [p,q] of pts){
        const len=p.distanceTo(q);
        d.position.copy(p).lerp(q,.5);
        dir.subVectors(q,p).normalize();
        d.quaternion.setFromUnitVectors(AX,dir);
        d.scale.set(CHORD,CHORD,len);d.updateMatrix();
        chords.setMatrixAt(ci++,d.matrix);
      }
      /* 缀条：柱身上每 3.2m 一道横撑 */
      const NLAC=7;
      for(let l=1;l<=NLAC;l++){
        const t=l/(NLAC+1);
        const c=new THREE.Vector3().copy(bot).lerp(top,t);
        for(let e=0;e<2;e++){
          const p=new THREE.Vector3().copy(c).addScaledVector(u1,(e?1:-1)*SPAN/2).addScaledVector(u2,-SPAN/2);
          const q=new THREE.Vector3().copy(c).addScaledVector(u1,(e?1:-1)*SPAN/2).addScaledVector(u2, SPAN/2);
          const len=p.distanceTo(q);
          d.position.copy(p).lerp(q,.5);
          dir.subVectors(q,p).normalize();
          d.quaternion.setFromUnitVectors(AX,dir);
          d.scale.set(.22,.22,len);d.updateMatrix();
          lacing.setMatrixAt(li++,d.matrix);
        }
      }
    }
    chords.instanceMatrix.needsUpdate=true;lacing.instanceMatrix.needsUpdate=true;
    chords.castShadow=false;chords.receiveShadow=false;nest.add(chords);
    lacing.castShadow=false;lacing.receiveShadow=false;nest.add(lacing);
  }

  /* ── 碗沿主环梁 + 顶口天洞环梁 ── */
  {
    const mk=(rA,rB,y,rad)=>{
      const pts=[];
      for(let i=0;i<80;i++){
        const a=i/80*Math.PI*2;
        pts.push(new THREE.Vector3(Math.cos(a)*NEST.B*rB,y,Math.sin(a)*NEST.A*rA));
      }
      const curve=new THREE.CatmullRomCurve3(pts,true);
      const m=add(nest,new THREE.TubeGeometry(curve,160,rad,8,true),nestSteelM,0,0,0);
      m.castShadow=true;
      return m;
    };
    mk(1.0,1.0,NEST.yRim-.15,.62);                                  // 碗沿主环梁
    mk(rN(1),rE(1),(NEST.yTopN+NEST.yTopE)/2,.70);                   // 天洞环梁（马鞍，取南北东西的平均高度）
  }
  /* 天洞环梁是马鞍的，必须分段按真实高度走，不能用一个平均高度 */
  {
    const pts=[];
    for(let i=0;i<120;i++){
      const a=i/120*Math.PI*2;
      const p=nestP(a,1,new THREE.Vector3());
      pts.push(p);
    }
    const curve=new THREE.CatmullRomCurve3(pts,true);
    const m=add(nest,new THREE.TubeGeometry(curve,180,.72,8,true),nestSteelM,0,0,0);
    m.castShadow=true;
  }

  /* ── 碗沿内侧泛光带：夜里看台被内场灯光打亮 ── */
  {
    const glowM=new THREE.MeshBasicMaterial({
      map:glowTex,color:0xffd39a,transparent:true,opacity:.40,
      blending:THREE.AdditiveBlending,depthWrite:false,fog:false});
    const g=new THREE.Mesh(ellipseBand(R_IN_A+1.0,R_IN_B+0.9,NEST.A-1.2,NEST.B-1.1,96),glowM);
    g.position.set(0,NEST.yRim-.55,0);
    g.renderOrder=2;g.userData.noReflect=true;nest.add(g);
  }
  /* ── 场边灯杆 ×4：灯头自发光 + 雪地乘法光池（不加点光源，省帧率）── */
  {
    const poleM=M(0x9ea4a9,{roughness:.72,metalness:.18});
    /* 雪地上的光一律走 MultiplyBlending：中心暖白、边缘纯白（边缘不变 = 没有硬边），
       颜色必须纯白，色相全烘在贴图里。 */
    const poolTex=(()=>{
      const S=256,[c,x]=cv(S,S);
      const gr=x.createRadialGradient(S/2,S/2,4,S/2,S/2,S/2);
      gr.addColorStop(0,'rgba(255,246,226,1)');
      gr.addColorStop(.55,'rgba(226,214,192,1)');
      gr.addColorStop(1,'rgba(255,255,255,1)');
      x.fillStyle=gr;x.fillRect(0,0,S,S);
      return ctex(c);
    })();
    const poolM=new THREE.MeshBasicMaterial({
      map:poolTex,color:0xffffff,transparent:true,opacity:.55,
      blending:THREE.MultiplyBlending,depthWrite:false,fog:false});
    for(const [lx,lz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const px=lx*16.5,pz=lz*12.0;
      addNS(nest,new THREE.CylinderGeometry(.20,.28,16.5,10),poleM,px,8.25,pz);
      addNS(nest,BX(2.6,.20,.20),M(0x5a6167,{roughness:.6,metalness:.4}),px,16.4,pz);
      for(const o of [-.9,.9]){
        addNS(nest,BX(1.2,.30,.66),M(0xfff2ca,{roughness:.4,emissive:0xffdc96,emissiveIntensity:.9}),px+o,16.1,pz);
      }
      const pool=new THREE.Mesh(new THREE.PlaneGeometry(1,1),poolM);
      pool.rotation.x=-Math.PI/2;pool.scale.set(26,26,1);pool.position.set(px,.055,pz);
      pool.renderOrder=2;pool.userData.noReflect=true;nest.add(pool);
    }
  }

  /* ── 南侧主入口：门廊 + 发光门厅 + 台阶 + 售票亭 + 旗杆 ── */
  {
    const ez=NEST.B+2.0;
    const doorGlow=new THREE.MeshStandardMaterial({
      color:0x243040,emissive:0xffbe76,emissiveIntensity:.62,roughness:.3});
    addNS(nest,BX(24,1.2,6.0),M(0xc2bdb4,{roughness:.86}),0,.6,ez+2.8);
    addNS(nest,BX(23.4,.18,5.6),M(0xd6d1c8,{roughness:.82}),0,1.26,ez+2.8);
    /* 门廊：六根钢柱 + 顶盖 */
    for(const sx of [-1,0,1])for(const sz of [-1,1]){
      addNS(nest,new THREE.CylinderGeometry(.30,.34,8.0,10),nestSteelM,sx*9.4,4.0,ez+2.8+sz*2.2);
    }
    addNS(nest,BX(23,.66,6.4),nestSteelM,0,8.3,ez+2.8);
    addNS(nest,BX(23.4,.24,6.8),M(0xeef4f8,{roughness:.94}),0,8.72,ez+2.8);
    /* 门厅暖光 */
    addNS(nest,BX(17,5.2,.16),doorGlow,0,2.8,ez+1.2);
    addNS(nest,BX(19,1.1,.6),M(0x2b323a,{roughness:.6,metalness:.35}),0,6.0,ez+1.1);
    /* 售票亭 ×2 */
    for(const sx of [-1,1]){
      const bx=sx*14.6;
      addNS(nest,BX(4.0,3.4,3.0),M(0xd8d3ca,{roughness:.8}),bx,1.7,ez+3.4);
      addNS(nest,BX(4.3,.26,3.3),M(0x9fa4a8,{roughness:.8}),bx,3.52,ez+3.4);
      addNS(nest,BX(4.4,.20,3.4),M(0xeef4f8,{roughness:.94}),bx,3.75,ez+3.4);
      addNS(nest,BX(2.4,1.2,.12),doorGlow,bx,2.1,ez+1.88);
    }
    /* 旗杆 ×4 */
    for(let i=0;i<4;i++){
      const fx=-13.5+i*9;
      addNS(nest,new THREE.CylinderGeometry(.09,.12,11.0,8),M(0xe4e6e8,{roughness:.34,metalness:.5}),fx,5.5,ez+6.4);
      addNS(nest,new THREE.SphereGeometry(.15,10,8),M(0xf0d68a,{roughness:.3,metalness:.7}),fx,11.2,ez+6.4);
      const fl=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.2),new THREE.MeshStandardMaterial({
        color:i%2?0xc02a2f:0x2f6ea8,side:THREE.DoubleSide,roughness:.85,emissive:0x241014,emissiveIntensity:.4}));
      fl.position.set(fx+.92,9.6,ez+6.4);fl.castShadow=false;nest.add(fl);
    }
  }

  /* ── 周边铺装环路 + 行道树 + 路灯 ── */
  {
    const paveM=M(0xc4ccd2,{roughness:.9});
    const ring=add(nest,ellipseBand(NEST.A+1.2,NEST.B+1.2,NEST.A+9.0,NEST.B+9.0,96),paveM,0,.06,0);
    ring.castShadow=false;ring.receiveShadow=true;
    const roadM=M(0xb9bec4,{roughness:.9});
    const outer=add(nest,ellipseBand(NEST.A+9.0,NEST.B+9.0,NEST.A+13.5,NEST.B+13.5,96),roadM,0,.05,0);
    outer.castShadow=false;outer.receiveShadow=true;
    /* 行道树：沿外环等距排（南侧留出入口） */
    const treeM=M(0x3f5a3c,{roughness:.95});
    for(let i=0;i<26;i++){
      const a=i/26*Math.PI*2;
      if(Math.sin(a)>0.72)continue;                       /* 南侧留口 */
      const px=Math.cos(a)*(NEST.B+11.2),pz=Math.sin(a)*(NEST.A+11.2);
      addNS(nest,new THREE.CylinderGeometry(.22,.30,3.2,7),M(0x4a3b2e,{roughness:.95}),px,1.6,pz);
      const cr=new THREE.Mesh(new THREE.ConeGeometry(1.9,5.4,8),treeM);
      cr.position.set(px,5.4,pz);cr.castShadow=true;nest.add(cr);
    }
    /* 路灯 */
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2;
      if(Math.sin(a)>0.72)continue;
      const px=Math.cos(a)*(NEST.B+9.8),pz=Math.sin(a)*(NEST.A+9.8);
      addNS(nest,new THREE.CylinderGeometry(.13,.18,6.2,8),M(0x6e747a,{roughness:.7,metalness:.3}),px,3.1,pz);
      addNS(nest,BX(.7,.22,.7),M(0xffeec4,{roughness:.4,emissive:0xffdca0,emissiveIntensity:.8}),px,6.3,pz);
    }
  }

  /* ── 碗沿碰撞：南侧留缺口，玩家能走进鸟巢（16 个圆近似椭圆）── */
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2;
    if(Math.sin(a)>0.80)continue;
    OUTDOOR_OBS.push([NEST.cx+Math.cos(a)*NEST.B*1.02,NEST.cz+Math.sin(a)*NEST.A*1.02,3.4]);
  }
}
