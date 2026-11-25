#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""熊萌艺术馆 2026-11-28：
   ① 除「熊萌艺术馆」门牌外，所有铭牌/牌匾/招牌全删
   ② 傍晚重新调光（原来环境光太亮太暖 + 雾太浓 → 模型全被洗成粉白）
   ③ 雨天提亮
   ④ 屋顶蒸汽云团染色收小（傍晚那坨死白）
"""
import io,re
P='/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace/xiongmeng-art-museum.html'
s=io.open(P,encoding='utf-8').read()
orig=s

def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, ('MISS %d'%s.count(old), old[:90])
    s=s.replace(old,new)

def cut(start,end,keep_end=True):
    """从 start 标记切到 end 标记（含）整段删除"""
    global s
    i=s.index(start); j=s.index(end,i)
    s=s[:i]+(s[j+len(end):] if keep_end else s[j:])

# ══════════════ ① 牌匾 / 铭牌 / 招牌 全删 ══════════════
# 1. 展签牌立柱（馆内二层小熊展签）
rep("""/* 展签牌：立柱 + 斜面铭牌 */
function labelPost(parent,x,z,rot,col){
  const g=new THREE.Group();g.position.set(x,F2,z);g.rotation.y=rot;parent.add(g);
  add(g,new THREE.CylinderGeometry(.026,.03,.62,6),M(0x6d747b,{roughness:.5,metalness:.6}),0,.31,0);
  const pl=add(g,BX(.34,.22,.035),M(0x2b3238,{roughness:.6}),0,.72,0);
  pl.rotation.x=-.4;
  add(g,BX(.28,.15,.012),M(col,{roughness:.8}),0,.723,.017);
  return g;
}

""","")
rep("""  labelPost(shop2,-.15,-2.9,-1.0,bearMats.polar);\n""","")
rep("""  labelPost(shop2,2.35,3.1,-.42,bearMats.honey);\n""","")
rep("""  labelPost(shop2,-1.55,4.95,.5,bearMats.moss);\n""","")
rep("""    labelPost(shop2,sx+.62,sz+.55,rot,pCol);\n""","")

# 2. 钢琴广场招牌（立柱 + 牌面）
rep("""  /* ── 广场招牌：告诉路过的人这是什么（挪到广场北侧，不挡钢琴的视线） ── */
  {
    const sg=new THREE.Group();
    sg.position.set(-48.6,0,-13.6);       // 挪到路边的雪地上，朝向来路，指向钢琴
    sg.rotation.y=1.95;
    plaza.add(sg);
    add(sg,new THREE.CylinderGeometry(.07,.09,2.55,8),M(0x4b3322,{roughness:.85}),0,1.27,0);
    add(sg,BX(2.05,.66,.07),M(0x1b2c48,{roughness:.5}),0,2.34,0);
    signPanel(sg,1.94,.56,animeSignTex(768,256,'圣诞钢琴广场','CHRISTMAS PIANO PLAZA','#f6d690'),0,2.34,.045,.9);
  }
""","")
rep("""  /* 碰撞：钢琴 / 琴凳 / 两棵树 / 招牌柱 */""","""  /* 碰撞：钢琴 / 琴凳 / 两棵树 */""")

# 3. 游乐园大门牌匾
cut("""    /* 牌匾：鎏金圆角框 + 酒红锦缎底 + 金字，挂在梁下正对大街 */""",
    """    for(const s of [-1,1])add(g,BX(.07,.62,.07),giltM,s*1.85,PH-.02,.48);
    }
""")
rep("""      // 梁中两侧的拱形花格（中间留空给牌匾）""","""      // 梁中两侧的拱形花格""")

# 4. 摩天轮提示牌
rep("""    // 摩天轮登舱台 + 提示牌（放在支架外侧前方 z=3.6）""",
    """    // 摩天轮登舱台（放在支架外侧前方 z=3.6）""")
rep("""    const wc=cv(384,96)[0],wx=wc.getContext('2d');
    wx.fillStyle='#192836';wx.fillRect(0,0,384,96);wx.strokeStyle='#e8b653';wx.lineWidth=6;wx.strokeRect(6,6,372,84);
    wx.fillStyle='#ffe8a6';wx.font='700 28px '+HK;wx.textAlign='center';wx.fillText('敞篷观景摩天轮',192,42);
    wx.fillStyle='#9fe8ff';wx.font='700 18px '+HK;wx.fillText('点击或按 E 上舱俯瞰全城',192,76);
    add(wDeck,BX(.10,1.6,.10),gldM,1.9,.8,.8);
    signPanel(wDeck,1.9,.48,ctex(wc),1.9,1.72,.84,.92);
""","")

# 5. 高空弹射跳伞标牌
rep("""    // 发光招牌灯箱
    const [lc,lx]=cv(512,96);
    lx.fillStyle='#1f1218';lx.fillRect(0,0,512,96);
    lx.strokeStyle='#f5c96b';lx.lineWidth=6;lx.strokeRect(6,6,500,84);
    lx.fillStyle='#ffe8a6';lx.font='700 32px '+HK;lx.textAlign='center';
    lx.fillText('高空弹射跳伞 · SKY LAUNCH',256,58);
    /* 标牌搬到地面：原来挂在 11.3m 高空（塔顶），现在做成塔前的小立牌，
       落地牌面朝 -z（旋转 180° 后正对游乐园入口方向，游客走过去就能看到） */
    for(const sx of [-1.05,1.05])add(g,BX(.11,1.05,.11),gldM,sx,.52,2.95);
    signPanel(g,2.2,.42,ctex(lc),0,1.02,2.95,.95);
""","")

# 6. 游乐园留言信箱牌面
rep("""      /* Canvas 发光牌面（贴在金框前后表面 z = -0.175 / -0.305，不重面不闪烁） */
      const gc=cv(512,320)[0],gx=gc.getContext('2d');
      gx.fillStyle='#192836';gx.fillRect(0,0,512,320);
      gx.strokeStyle='#e8b653';gx.lineWidth=10;gx.strokeRect(10,10,492,300);
      gx.fillStyle='#ffe8aa';gx.font='700 44px '+HK;gx.textAlign='center';
      gx.fillText('游乐园留言信箱',256,116);
      gx.fillStyle='#9fe8ff';gx.font='700 24px '+HK;
      gx.fillText('点击信箱 · 拆信读留言 / 匿名投递',256,184);
      gx.fillStyle='#f4c56a';gx.font='700 18px monospace';
      gx.fillText('GUESTBOOK MAILBOX · MAX 30 CHARS',256,244);
      const gtex=ctex(gc);
      signPanel(gb,1.62,1.00,gtex,0,2.05,-.17,.92);
""","")

# 7. 马戏团入口招牌
rep("""    signPanel(ent,4.8,1.34,animeSignTex(512,150,'熊萌马戏团','XIONGMENG CIRCUS · BIG TOP',"#ffd466","#1b0f12","#3d1a16"),0,3.42,.12,.92);
""","")

# 8. 贵州大学：校名牌 / 校训墙文字 / 食堂门头
rep("""    /* 门楣横梁 + 「贵州大学」 */""","""    /* 门楣横梁 */""")
rep("""    const nameTex=gzuSignTex(1024,128,'贵州大学','#c02a2f','rgba(90,18,16,.85)');
    for(const s of [1,-1]){
      const p=new THREE.Mesh(new THREE.PlaneGeometry(15,1.9),new THREE.MeshStandardMaterial({
        map:nameTex,emissiveMap:nameTex,transparent:true,roughness:.5,metalness:.1,
        emissive:0xff8a72,emissiveIntensity:.85}));
      p.position.set(0,11.6,gz+s*1.56);if(s<0)p.rotation.y=Math.PI;p.castShadow=false;campus.add(p);
    }
""","")
rep("""    /* 校训墙：明德至善 博学笃行 */
    const mottoTex=gzuSignTex(1024,128,'明德至善  博学笃行','#d9b45e','rgba(60,44,14,.8)');
    for(const s of [-1,1]){
      addNS(campus,BX(13,.42,1.5),gzuGraniteD,s*15.6,1.05,gz-2.6);
      addNS(campus,BX(13.2,.22,1.7),M(0xb0aaa0,{roughness:.8}),s*15.6,1.35,gz-2.6);
      addNS(campus,BX(13.0,.14,1.5),snowTopM,s*15.6,1.51,gz-2.6);
      const p=new THREE.Mesh(new THREE.PlaneGeometry(11.4,1.42),new THREE.MeshStandardMaterial({
        map:mottoTex,emissiveMap:mottoTex,transparent:true,roughness:.6,
        emissive:0xffd894,emissiveIntensity:.60}));
      p.position.set(s*15.6,1.05,gz-3.36);p.rotation.y=Math.PI;p.castShadow=false;campus.add(p);
    }
""","""    /* 校训墙（只留墙身，文字牌匾已删） */
    for(const s of [-1,1]){
      addNS(campus,BX(13,.42,1.5),gzuGraniteD,s*15.6,1.05,gz-2.6);
      addNS(campus,BX(13.2,.22,1.7),M(0xb0aaa0,{roughness:.8}),s*15.6,1.35,gz-2.6);
      addNS(campus,BX(13.0,.14,1.5),snowTopM,s*15.6,1.51,gz-2.6);
    }
""")
rep("""    /* 门头招牌 */
    const st=gzuSignTex(512,128,'学生食堂','#d9b45e','rgba(60,44,14,.8)');
    const sp=new THREE.Mesh(new THREE.PlaneGeometry(7.2,1.8),new THREE.MeshStandardMaterial({
      map:st,transparent:true,roughness:.6,emissive:0x241a06,emissiveIntensity:.4}));
    sp.position.set(cx,5.4,cz-d/2-2.35);sp.rotation.y=Math.PI;sp.castShadow=false;campus.add(sp);
""","")

# 9. 市集摊位檐口横招牌（29 块）
rep("""  /* 招牌：4:1 画幅配 4:1 图集格（绝不拉伸），挂在雨篷上方、檐口正下方 */
  {
    const si=SIGN_ATLAS.drawH(o.cn,o.en,o.accent);
    SK.signBoard(g,2.88,.72,si,0,2.84,face+.12,false);
    add(g,BX(3.02,.08,.12),trimD,0,3.21,face+.14);
    add(g,BX(3.02,.08,.12),trimD,0,2.47,face+.14);
  }
""","""  /* 檐口横匾已删（全场只保留艺术馆门牌），这里只留两道装饰线脚 */
  {
    add(g,BX(3.02,.08,.12),trimD,0,3.21,face+.14);
    add(g,BX(3.02,.08,.12),trimD,0,2.47,face+.14);
  }
""")

# 10. 店铺街竖挑招牌 + 正面横匾（9 块 + 9 块）
rep("""  /* 竖挑双面招牌（牌面架在立柱顶，绝不被杆子横穿）*/
  {
    const vi=SIGN_ATLAS.drawV(o.cn,o.en,o.accent);
    add(g,BX(.12,.52,.12),woodL,0,H+.52,0);
    SK.signBoard(g,.66,1.06,vi,0,H+1.31,.02,true);
    add(g,BX(.74,.09,.14),woodL,0,H+.78,.02);
    const fin=add(g,new THREE.ConeGeometry(.09,.26,6),SK.M.gold,0,H+1.93,.02);
    fin.castShadow=false;
  }
  /* 正面横匾（挂在垂帘上方）*/
  {
    const hi=SIGN_ATLAS.drawH(o.cn,o.en,o.accent);
    SK.signBoard(g,2.10,.525,hi,0,H-.26,D/2+.30,false);
    add(g,BX(2.24,.08,.12),woodD,0,H+.02,D/2+.32);
    for(const s of [-1,1])add(g,BX(.04,.14,.04),SK.M.iron,s*.9,H-.44,D/2+.31);
  }
""","""  /* 竖挑招牌与正面横匾已删（全场只保留艺术馆门牌），只留檐下线脚 */
  {
    add(g,BX(2.24,.08,.12),woodD,0,H+.02,D/2+.32);
  }
""")

# 11. 清理已无人使用的招牌系统
cut("""/* ── 招牌图集：横版 4×8（512×128）/ 竖版 4×4（256×420）── */""",
    """  return {H,V,drawH,drawV,flush(){H.t.needsUpdate=true;V.t.needsUpdate=true;}};
})();""")
rep("""SK.M.signH  =new THREE.MeshStandardMaterial({map:SIGN_ATLAS.H.t,emissiveMap:SIGN_ATLAS.H.t,emissive:0xffffff,emissiveIntensity:.52,roughness:.34});
SK.M.signV  =new THREE.MeshStandardMaterial({map:SIGN_ATLAS.V.t,emissiveMap:SIGN_ATLAS.V.t,emissive:0xffffff,emissiveIntensity:.58,roughness:.34});
""","")
rep("""/* ── 招牌板：正面 + 背面（背面 U 镜像，文字不会反）── */
SK.signBoard=(parent,w,h,idx,x,y,z,vert)=>{
  const A=vert?SIGN_ATLAS.V:SIGN_ATLAS.H;
  const mk=(back)=>{
    const g=new THREE.PlaneGeometry(w,h);
    SK.uvCell(g,idx%A.cols,(idx/A.cols)|0,A.cols,A.rows,back);
    const m=new THREE.Mesh(g,vert?SK.M.signV:SK.M.signH);
    m.position.set(x,y,z+(back?-.022:.022));
    if(back)m.rotation.y=Math.PI;
    m.castShadow=false;parent.add(m);
  };
  mk(false);mk(true);
};

""","")
rep("""/* 招牌图集：所有招牌画完后统一上传（否则第一次渲染拿到的是空画布）*/
SIGN_ATLAS.flush();
""","")
# 双面牌匾绘制助手（animeSignTex / signPanel）已无人使用
rep("""/* 双面牌匾：正反两面各一块，字都是正的。
   单面的话从背面看要么被剔除（牌匾消失），要么字是镜像的 —— 都不行。 */
function animeSignTex(w,h,cn,en,accent='#f6d690',bgTop='#0f1e36',bgBot='#1b3154'){
  const [c,x]=cv(w,h);
  const g=x.createLinearGradient(0,0,w,h);
  g.addColorStop(0,bgTop);g.addColorStop(1,bgBot);
  x.fillStyle=g;x.fillRect(0,0,w,h);
  const rg=x.createRadialGradient(w*.82,h*.22,2,w*.82,h*.22,w*.48);
  rg.addColorStop(0,'rgba(255,204,136,0.20)');rg.addColorStop(1,'rgba(255,204,136,0)');
  x.fillStyle=rg;x.fillRect(0,0,w,h);
  const pad=Math.max(5,Math.round(h*.07));
  x.strokeStyle=accent;x.globalAlpha=.72;x.lineWidth=Math.max(2,Math.round(h*.035));
  x.strokeRect(pad,pad,w-pad*2,h-pad*2);x.globalAlpha=1;
  x.textAlign='center';
  x.fillStyle='#fff4dc';
  x.font='700 '+Math.round(h*.36)+'px '+HK;
  x.fillText(cn,w/2,Math.round(h*.49));
  x.fillStyle='#a8d8ff';
  x.font='600 '+Math.max(11,Math.round(h*.165))+'px '+HK;
  x.fillText(en,w/2,Math.round(h*.80));
  return ctex(c);
}
function signPanel(parent,w,h,tex,x,y,z,em){
  const mat=new THREE.MeshStandardMaterial({
    map:tex,emissiveMap:tex,emissive:0xffffff,emissiveIntensity:Math.min(.68,em===undefined?.65:em),roughness:.32});
  for(const s of [1,-1]){
    const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
    p.position.set(x,y,z+s*.014);
    if(s<0)p.rotation.y=Math.PI;
    parent.add(p);
  }
  return mat;
}
""","")
# 校名牌匾绘制助手（gzuSignTex）已无人使用
rep("""  /* ── 2.5.8 校名 / 校训牌匾（红字 / 金字，透明底，贴在石材上） ── */
  const gzuSignTex=(w,h,txt,fill,stroke)=>{
    const [c,x]=cv(w,h);
    x.clearRect(0,0,w,h);
    x.textAlign='center';x.textBaseline='middle';
    x.font='700 '+Math.round(h*.62)+'px '+HK;
    x.lineWidth=Math.max(2,h*.05);
    x.strokeStyle=stroke;x.strokeText(txt,w/2,h*.52);
    x.fillStyle=fill;x.fillText(txt,w/2,h*.52);
    const t=ctex(c);t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;return t;
  };

""","")

# ══════════════ ② 傍晚重新调光 ══════════════
# 雾：原来又浓又亮（0x9b746a 是浅粉棕）→ 远景全被洗成粉白
rep("""  {k:'dawn', name:'晨',h:6.7, weather:'雪晓',sky:['#1e2d48','#6a6180','#c98c88','rgba(255,188,160,.40)'],fog:0x4e5268,fogD:.0102,""",
"""  {k:'dawn', name:'晨',h:6.7, weather:'雪晓',sky:['#1e2d48','#6a6180','#c98c88','rgba(255,182,158,.28)'],fog:0x3b4054,fogD:.0064,""")
rep("""  {k:'dusk', name:'暮',h:17.5,weather:'雪霞',sky:['#263b68','#995878','#f0a46c','rgba(255,176,105,.65)'],fog:0x9b746a,fogD:.0082,""",
"""  {k:'dusk', name:'暮',h:17.5,weather:'雪霞',sky:['#263b68','#995878','#f0a46c','rgba(255,170,110,.40)'],fog:0x6e5661,fogD:.0048,""")

# 环境光 / 半球光：原来又亮又暖 → 所有浅色模型被洗成粉白，模型没有明暗
rep("""    key.intensity=(sunset||dawn)?(1.15+elev*.9):(1.15+elev*1.35);""",
"""    key.intensity=(sunset||dawn)?(1.90+elev*1.15):(1.15+elev*1.35);""")
rep("""    ambient.color.setHex(rainy?0x93a2b0:(sunset?0xb998a8:dawn?0xb8a4ba:0xb5cde3));""",
"""    ambient.color.setHex(rainy?0xa9b7c4:(sunset?0x6f5c78:dawn?0x6e6478:0xb5cde3));""")
rep("""    ambient.intensity=rainy?.96:((sunset||dawn)?.78:.88);""",
"""    ambient.intensity=rainy?1.16:((sunset||dawn)?.56:.88);""")
rep("""    hemi.color.setHex(rainy?0x9aa6b2:(sunset?0xe8a088:dawn?0xdfa8b0:0xafd0f0));""",
"""    hemi.color.setHex(rainy?0xbcc8d4:(sunset?0xc47c66:dawn?0xbe8792:0xafd0f0));""")
rep("""    hemi.groundColor.setHex(rainy?0x4c5259:(sunset?0x50404c:0x788a9a));""",
"""    hemi.groundColor.setHex(rainy?0x606a74:(sunset?0x3a2f3c:(dawn?0x4a5462:0x788a9a)));""")
rep("""    hemi.intensity=rainy?1.02:.92;""",
"""    hemi.intensity=rainy?1.24:.66;""")
# 远景楼群自发光：傍晚 .35 会把整片天际线洗白
rep("""    skylineMats.forEach(m=>{m.emissiveIntensity=rainy?.16:((sunset||dawn)?.35:.08);});""",
"""    skylineMats.forEach(m=>{m.emissiveIntensity=rainy?.22:((sunset||dawn)?.15:.08);});""")
rep("""    GZU_EMI.forEach(it=>{it.m.emissiveIntensity=rainy?it.d*.35:((sunset||dawn)?it.n*.6:it.d);});""",
"""    GZU_EMI.forEach(it=>{it.m.emissiveIntensity=rainy?it.d*.35:((sunset||dawn)?it.n*.38:it.d);});""")

# ══════════════ ③ 雨天提亮 ══════════════
rep("""   rainSky:['#161f30','#3a4354','#5b6070','rgba(150,170,195,.26)'],rainFog:0x3d4452,rainFogD:.0142},""",
"""   rainSky:['#3c4a5e','#66758a','#939fb0','rgba(190,206,222,.30)'],rainFog:0x5a6678,rainFogD:.0116},""")
rep("""   rainSky:['#5b6a78','#7d8a95','#9aa4ad','rgba(200,210,220,.36)'],rainFog:0x8b96a0,rainFogD:.0108},""",
"""   rainSky:['#93a0ab','#aeb9c2','#c6ced5','rgba(224,232,238,.40)'],rainFog:0xaab4be,rainFogD:.0084},""")
rep("""   rainSky:['#1e2637','#463f50','#6b575c','rgba(176,136,116,.36)'],rainFog:0x65575b,rainFogD:.0128},""",
"""   rainSky:['#46485c','#716676','#998385','rgba(214,180,154,.38)'],rainFog:0x7e7075,rainFogD:.0100},""")
rep("""   rainSky:['#0d1622','#18212e','#232c38','rgba(120,142,172,.18)'],rainFog:0x1c2532,rainFogD:.0148}""",
"""   rainSky:['#1c2735','#2b3848','#3e4c5c','rgba(150,170,196,.22)'],rainFog:0x2c3846,rainFogD:.0118}""")
rep("""    if(rainy){key.color.setHex(0xb4c0cc);key.intensity*=.55;}""",
"""    if(rainy){key.color.setHex(0xc2cdd8);key.intensity*=.72;}""")
# 夜雨：阴天的夜比晴夜亮（云把地面光反下来），之前反而更暗
rep("""    key.color.setHex(rainy?0x8fa2b8:0xa8ccf0);key.intensity=rainy?.14:.38;""",
"""    key.color.setHex(rainy?0x9fb2c8:0xa8ccf0);key.intensity=rainy?.26:.38;""")
rep("""    moon.intensity=rainy?.14:.40;moon.color.setHex(0x86aee8);""",
"""    moon.intensity=rainy?.30:.40;moon.color.setHex(0x86aee8);""")
rep("""    ambient.color.setHex(rainy?0x27313c:0x2d4160);ambient.intensity=rainy?.50:.47;""",
"""    ambient.color.setHex(rainy?0x38485c:0x2d4160);ambient.intensity=rainy?.78:.47;""")
rep("""    hemi.color.setHex(rainy?0x3b4a58:0x46668c);hemi.groundColor.setHex(rainy?0x141a20:0x16202c);""",
"""    hemi.color.setHex(rainy?0x5c7288:0x46668c);hemi.groundColor.setHex(rainy?0x222a33:0x16202c);""")
rep("""    hemi.intensity=rainy?.58:.52;""",
"""    hemi.intensity=rainy?.88:.52;""")
rep("""    skylineMats.forEach(m=>{m.emissiveIntensity=rainy?.30:.62;});""",
"""    skylineMats.forEach(m=>{m.emissiveIntensity=rainy?.42:.62;});""")
# 雨天地面：湿雪地是被阴天天光照亮的浅灰，不是深灰
rep("""  ground.material.color.setHex(rainy?0x8d97a4:0xd0ddeb);""",
"""  ground.material.color.setHex(rainy?0xa7b1bc:0xd0ddeb);""")
rep("""  ground.material.roughness=rainy?.42:.88;""",
"""  ground.material.roughness=rainy?.38:.88;""")
rep("""  ground.material.metalness=rainy?.10:.03;""",
"""  ground.material.metalness=rainy?.14:.03;""")
rep("""  ground.material.envMapIntensity=rainy?1.25:.85;""",
"""  ground.material.envMapIntensity=rainy?1.55:.85;""")
rep("""  road.material.color.setHex(rainy?0x6d757f:0x8e99a4);""",
"""  road.material.color.setHex(rainy?0x7f8791:0x8e99a4);""")
rep("""  lampPools.forEach(p=>{p.material.opacity=rainy?.16:.30;});""",
"""  lampPools.forEach(p=>{p.material.opacity=rainy?.24:.30;});""")
rep("""  renderer.toneMappingExposure=state.quality?(IS_TOUCH_DEV?1.14:1.12):1.06;""",
"""  renderer.toneMappingExposure=(state.quality?(IS_TOUCH_DEV?1.14:1.12):1.06)*(state.weather==='rain'?1.10:1);""")
rep("""  sfx.setRain(rainy?1:0);
  applyTime(state.hour);      // 天空/雾/灯光随天气一起换""",
"""  sfx.setRain(rainy?1:0);
  renderer.toneMappingExposure=(state.quality?(IS_TOUCH_DEV?1.14:1.12):1.06)*(rainy?1.10:1);
  applyTime(state.hour);      // 天空/雾/灯光随天气一起换""")
rep("""    if(rainLevel>0)MUL_GLOW_K*=.60;""",
"""    if(rainLevel>0)MUL_GLOW_K*=.78;""")

# ══════════════ ④ 屋顶蒸汽云团：死白 → 染环境色、收小、降浓度 ══════════════
rep("""      const smat=new THREE.SpriteMaterial({
        map:roofSteamTex,color:0xf4f8ff,transparent:true,opacity:.55,
        depthWrite:false,fog:false
      });""",
"""      const smat=new THREE.SpriteMaterial({
        map:roofSteamTex,color:0xf0f4fa,transparent:true,opacity:.30,
        depthWrite:false,fog:false
      });""")
rep("""      const radius=(0.38+Math.pow(u,.75)*2.15)*p.sc;""",
"""      const radius=(0.30+Math.pow(u,.75)*1.72)*p.sc;""")
rep("""      p.mat.opacity=0.62*fadeIn*fadeOut;""",
"""      p.mat.opacity=0.62*fadeIn*fadeOut*steamK;""")
rep("""  // 天窗（略高于屋面积雪层，四边带积雪围边，避开右侧上天台楼梯洞）""",
"""/* 蒸汽白膜总控：云团不能是死白。
   纯白半透明 sprite 在暗背景上会糊成一片"白膜"（实测傍晚 17:30 屋顶那团
   白斑就是它，不是灯、不是雾）。所以颜色要跟着环境光走，浓度要跟着时段走。 */
function setSteamLook(k,col){
  steamK=k;steamCol=col;
  if(window._roofSteamPuffs)for(const p of window._roofSteamPuffs)p.mat.color.setHex(col);
}
  // 天窗（略高于屋面积雪层，四边带积雪围边，避开右侧上天台楼梯洞）""")
rep("""let rainLevel=0,resetPerf=true;""",
"""let rainLevel=0,resetPerf=true;
/* 白膜总控：屋顶蒸汽云团 / 地标体积光雾的浓度（随时段 + 天气变）。
   傍晚是全场最暗的时候，任何"白色半透明团"都会在暗背景上变成白膜，
   所以这两个系数必须随时段收，夜里也不开满。 */
let mistK=1,steamK=1,steamCol=0xf0f4fa;""")
rep("""    [ 26.5, 4.8, -2.0, 18, 0xffcf7a, .10], // 7. 东侧动漫雪园核心雕塑群暖金光雾""",
"""    [ 26.5, 4.8, -2.0, 12, 0xffcf7a, .10], // 7. 东侧动漫雪园核心雕塑群暖金光雾""")
rep("""    m.mat.opacity=m.baseOp*fgClear*farFade*mistHeightAtten*pulse;""",
"""    m.mat.opacity=m.baseOp*fgClear*farFade*mistHeightAtten*pulse*mistK;""")
rep("""  key.target.position.set(0,2,0);
  state.envDirty=true;""",
"""  /* ── 白膜总闸 ──
     蒸汽云团和地标光雾是画面里仅有的两块"大面积白色半透明"，
     傍晚（最暗）必须收着放，否则整片天就是白膜；
     白天可以满开，夜里留一点（夜里要有暖光跳出来，不能被白雾洗平）。 */
  if(slot.k==='noon'){setSteamLook(1.00,0xf2f6fb);mistK=1.00;}
  else if(slot.k==='dawn'){setSteamLook(.80,0xe9eff7);mistK=.85;}
  else if(slot.k==='dusk'){setSteamLook(.42,0xd8ccce);mistK=.55;}
  else{setSteamLook(.30,0xa7b7c9);mistK=.70;}
  if(rainy){steamK*=.55;mistK*=.70;}

  key.target.position.set(0,2,0);
  state.envDirty=true;""")

io.open(P,'w',encoding='utf-8').write(s)
print('OK  %d -> %d bytes'%(len(orig),len(s)))
