/* 鸟巢伞骨柱几何自检（纯数学，不依赖浏览器）
   复现主文件里的曲线与柱参数，逐角度验证：
     ① 柱轴全程在屋面之下，只在柱头一点相接（不穿屋面）
     ② 柱在碗沿环梁半径处：柱顶 < 环梁底（不穿环梁）
     ③ 柱在到达看台外缘之前已高于看台顶面（不穿看台踏面）
     ④ 柱不与悬挑斜撑环带相交
   判据全部按「余量」输出，最小余量为负即穿模。 */
const A=48,B=43.6,yRim=9.0,yTopN=20.0,yTopE=14.5;
const OUT_A=A-4.0,OUT_B=B-4.0;
const K=1.72,SPAN=1.95,CHORD=.46;
const FOOT_X=B+4.0,FOOT_Z=A+4.0;
const N_STEP=18,R_IN_A=25.0,R_IN_B=18.4;

const curveAt=(tbl,v)=>{
  for(let i=0;i<tbl.length-1;i++){
    if(v>=tbl[i][0]&&v<=tbl[i+1][0]){
      const t=(v-tbl[i][0])/(tbl[i+1][0]-tbl[i][0]);
      return tbl[i][1]+(tbl[i+1][1]-tbl[i][1])*t;
    }
  }
  return tbl[tbl.length-1][1];
};
const rN=v=>curveAt([[0,1],[0.32,0.955],[0.64,0.845],[1,0.542]],v);
const rE=v=>curveAt([[0,1],[0.32,0.945],[0.64,0.820],[1,0.400]],v);
const fH =v=>curveAt([[0,0],[0.35,0.42],[0.70,0.78],[1,1]],v);
const nestY=(a,v)=>yRim+fH(v)*((yTopN-yRim)*Math.sin(a)**2+(yTopE-yRim)*Math.cos(a)**2);
const nestP=(a,v)=>({x:Math.cos(a)*B*rE(v),y:nestY(a,v),z:Math.sin(a)*A*rN(v)});
const dF=a=>Math.hypot(FOOT_X*Math.cos(a),FOOT_Z*Math.sin(a));
const dQ=(a,v)=>{const p=nestP(a,v);return Math.hypot(p.x,p.z);};
const solveV=(a)=>{
  const DF=dF(a);let pv=0,pf=Infinity;
  for(let i=1;i<=300;i++){
    const v=i/300*.98;
    const f=nestY(a,v)-K*(DF-dQ(a,v));
    if(pf===Infinity){pv=v;pf=f;continue;}
    if(pf>0&&f<=0)return pv+(v-pv)*(pf/(pf-f));
    pv=v;pf=f;
  }
  return .5;
};

/* 柱轴方向单位向量（世界），柱截面为垂直于轴的 1.95×1.95 方管 */
function columnFrame(a){
  const v=solveV(a);
  const bot={x:Math.cos(a)*FOOT_X,y:0,z:Math.sin(a)*FOOT_Z};
  const top=nestP(a,v);
  const ax={x:top.x-bot.x,y:top.y-bot.y,z:top.z-bot.z};
  const L=Math.hypot(ax.x,ax.y,ax.z);
  ax.x/=L;ax.y/=L;ax.z/=L;
  /* u1 = 水平且垂直于柱的方位；u2 = ax×u1（在竖直平面内） */
  const hx=Math.cos(a),hz=Math.sin(a);              /* 水平径向单位向量 */
  const u1={x:-hz,y:0,z:hx};                         /* 环向 */
  const u2={x:ax.y*u1.z-ax.z*u1.y, y:ax.z*u1.x-ax.x*u1.z, z:ax.x*u1.y-ax.y*u1.x};
  return {bot,top,ax,v,L,u1,u2};
}
/* 柱体在「水平半径 r」处（沿柱方向参数）的中心高度与上下缘 */
function atRadius(col,rAlong){
  /* rAlong: 从柱脚沿轴走过的水平投影距离 */
  const t=rAlong/(col.L*Math.hypot(col.ax.x,col.ax.z));
  const cy=col.bot.y+(col.top.y-col.bot.y)*t;
  /* 截面的竖直半高：u2 的竖直分量 × SPAN/2 */
  const vh=Math.abs(col.u2.y)*SPAN/2;
  return {cy,lo:cy-vh,hi:cy+vh};
}
/* 柱在某个世界水平半径（沿方位角 a 的径向距离）处的位置 */
function radialDist(a,col){return dF(a)-rAlongOf(a,col);}
function rAlongOf(a,col){
  /* 柱脚水平半径 dF，柱头 dQ；线性插值 */
  return col.rAlong===undefined?0:0;
}

let worst={
  roof:1e9, ring:1e9, stand:1e9, strut:1e9, vmin:9, vmax:0
};
const rows=[];
for(let s=0;s<24;s++){
  const a=s/24*Math.PI*2;
  const col=columnFrame(a);
  const DF=dF(a), DQ=dQ(a,col.v);
  /* ① 屋面：柱轴上每一点与屋面的高差（正=柱在屋面下） */
  let roofMargin=1e9;
  for(let i=0;i<=60;i++){
    const r=DF-(DF-DQ)*(i/60);          // 径向距离
    const t=i/60;
    const cy=col.bot.y+(col.top.y-col.bot.y)*t;
    /* 该径向距离对应的屋面高度（按椭圆参数反解 v） */
    let vv=col.v;
    for(let k=0;k<40;k++){
      const test=nestP(a,Math.max(0,Math.min(.98,vv)));
      const dd=Math.hypot(test.x,test.z);
      if(Math.abs(dd-r)<0.02)break;
      vv+=(r-dd)*0.02;
      vv=Math.max(0,Math.min(.98,vv));
    }
    const ry=nestY(a,vv);
    roofMargin=Math.min(roofMargin,ry-cy);
  }
  /* ② 碗沿环梁：柱在环梁半径(A/B 对应径向距离)处的顶缘 vs 环梁底 */
  const ringDist=Math.hypot(B*Math.cos(a),A*Math.sin(a)); // 环梁点距圆心
  const tRing=(DF-ringDist)/(DF-DQ);
  const cRing=col.bot.y+(col.top.y-col.bot.y)*tRing;
  const vh=Math.abs(col.u2.y)*SPAN/2;
  const ringMargin=(yRim-.15-.62)-(cRing+vh);   // 环梁底 - 柱顶
  /* ③ 看台：柱在半径降到看台外缘时的下缘 vs 看台顶面 */
  const standDist=Math.hypot(OUT_A*Math.sin(a),OUT_B*Math.cos(a));
  const tStand=(DF-standDist)/(DF-DQ);
  const cStand=col.bot.y+(col.top.y-col.bot.y)*tStand;
  const standMargin=(cStand-vh)-(0.55+(N_STEP-1)*0.50);
  /* ④ 悬挑斜撑环带：24 根斜撑，角度与柱错开 7.5°
     判据 = 柱中心线到最近斜撑中心线的最小距离，是否 > 柱半宽 + 斜撑半宽 */
  let strutMargin=1e9;
  {
    const v3={x:0,y:0,z:0};
    const seg=[[0,0,0],[0,0,0]];
    let best=1e9;
    for(const off of [Math.PI/24,-Math.PI/24]){
      const a2=a+off;
      const P={x:Math.cos(a2)*OUT_B,y:yRim-.36,z:Math.sin(a2)*OUT_A};
      const Q={x:Math.cos(a2)*B,y:yRim+.02,z:Math.sin(a2)*A};
      for(let i=0;i<=80;i++){
        const t=i/80;
        const c={x:col.bot.x+(col.top.x-col.bot.x)*t,
                 y:col.bot.y+(col.top.y-col.bot.y)*t,
                 z:col.bot.z+(col.top.z-col.bot.z)*t};
        /* 点到线段 PQ 的距离 */
        const ux=Q.x-P.x,uy=Q.y-P.y,uz=Q.z-P.z;
        const wx=c.x-P.x,wy=c.y-P.y,wz=c.z-P.z;
        const uu=ux*ux+uy*uy+uz*uz;
        let s=(wx*ux+wy*uy+wz*uz)/uu; s=Math.max(0,Math.min(1,s));
        const dx=wx-ux*s,dy=wy-uy*s,dz=wz-uz*s;
        best=Math.min(best,Math.hypot(dx,dy,dz));
      }
    }
    strutMargin=best-(SPAN/2+.13+.12);
  }
  worst.roof=Math.min(worst.roof,roofMargin);
  worst.ring=Math.min(worst.ring,ringMargin);
  worst.stand=Math.min(worst.stand,standMargin);
  worst.strut=Math.min(worst.strut,strutMargin);
  worst.vmin=Math.min(worst.vmin,col.v);worst.vmax=Math.max(worst.vmax,col.v);
  rows.push({deg:Math.round(s*15),v:+col.v.toFixed(3),
    colTopY:+col.top.y.toFixed(2),roof:+roofMargin.toFixed(2),
    ring:+ringMargin.toFixed(2),stand:+standMargin.toFixed(2),strut:+strutMargin.toFixed(2)});
}
console.log('=== 24 根伞骨柱穿模余量（负数=穿模，单位 m）===');
console.table(rows);
console.log('最差余量：屋面',worst.roof.toFixed(2),
  '| 环梁',worst.ring.toFixed(2),
  '| 看台',worst.stand.toFixed(2),
  '| 悬挑斜撑',worst.strut.toFixed(2));
console.log('柱头 v 范围',worst.vmin.toFixed(3),'~',worst.vmax.toFixed(3));
console.log('屋面南北端高度',nestY(Math.PI/2,1).toFixed(2),
  '| 东西端',nestY(0,1).toFixed(2),
  '| 天洞半轴',(A*rN(1)).toFixed(1),'x',(B*rE(1)).toFixed(1));
