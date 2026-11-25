#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""熊萌艺术馆：① 傍晚白膜（屋顶蒸汽云团 + 地标光雾）② 雨天太暗"""
import io,sys
P='/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace/xiongmeng-art-museum.html'
s=io.open(P,encoding='utf-8').read()
orig=s
E=[]

def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:80])
    s=s.replace(old,new)

# ── 1. 屋顶蒸汽云团：死白 → 随环境染色；云团收小 ───────────────────────
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

# 蒸汽控制函数插在蒸汽创建之后
rep("""  // 天窗（略高于屋面积雪层，四边带积雪围边，避开右侧上天台楼梯洞）""",
"""/* 蒸汽白膜总控：云团不能是死白。
   纯白半透明 sprite 在暗背景上会糊成一片"白膜"（实测傍晚 17:30 时屋顶那团
   白斑就是它，不是灯、不是雾）。所以颜色要跟着环境光走，浓度要跟着时段走。 */
function setSteamLook(k,col){
  steamK=k;steamCol=col;
  if(window._roofSteamPuffs)for(const p of window._roofSteamPuffs)p.mat.color.setHex(col);
}
  // 天窗（略高于屋面积雪层，四边带积雪围边，避开右侧上天台楼梯洞）""")

# ── 2. 地标体积光雾：第 7 处太大（画面上铺了 400px 半径），收小 + 跟随时段 ──
rep("""    [ 26.5, 4.8, -2.0, 18, 0xffcf7a, .10], // 7. 东侧动漫雪园核心雕塑群暖金光雾""",
"""    [ 26.5, 4.8, -2.0, 12, 0xffcf7a, .10], // 7. 东侧动漫雪园核心雕塑群暖金光雾""")

rep("""    m.mat.opacity=m.baseOp*fgClear*farFade*mistHeightAtten*pulse;""",
"""    m.mat.opacity=m.baseOp*fgClear*farFade*mistHeightAtten*pulse*mistK;""")

# ── 3. 全局白膜系数声明 ──────────────────────────────────────────────
rep("""let rainLevel=0,resetPerf=true;""",
"""let rainLevel=0,resetPerf=true;
/* 白膜总控：屋顶蒸汽云团 / 地标体积光雾的浓度（随时段 + 天气变）。
   傍晚是全场最暗的时候，任何"白色半透明团"都会在暗背景上变成白膜，
   所以这两个系数必须随时段收，夜里也不开满。 */
let mistK=1,steamK=1,steamCol=0xf0f4fa;""")

# ── 4. applyTime 里按时段调白膜 + 提亮雨天 ───────────────────────────
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

# ── 5. 雨天提亮 ───────────────────────────────────────────────────────
# 5.1 雨天天色：阴天的天其实是亮的灰白，不是深蓝；雾也压薄一半
rep("""   rainSky:['#161f30','#3a4354','#5b6070','rgba(150,170,195,.26)'],rainFog:0x3d4452,rainFogD:.0142},""",
"""   rainSky:['#3c4a5e','#66758a','#939fb0','rgba(190,206,222,.30)'],rainFog:0x5a6678,rainFogD:.0116},""")
rep("""   rainSky:['#5b6a78','#7d8a95','#9aa4ad','rgba(200,210,220,.36)'],rainFog:0x8b96a0,rainFogD:.0108},""",
"""   rainSky:['#93a0ab','#aeb9c2','#c6ced5','rgba(224,232,238,.40)'],rainFog:0xaab4be,rainFogD:.0084},""")
rep("""   rainSky:['#1e2637','#463f50','#6b575c','rgba(176,136,116,.36)'],rainFog:0x65575b,rainFogD:.0128},""",
"""   rainSky:['#46485c','#716676','#998385','rgba(214,180,154,.38)'],rainFog:0x7e7075,rainFogD:.0100},""")
rep("""   rainSky:['#0d1622','#18212e','#232c38','rgba(120,142,172,.18)'],rainFog:0x1c2532,rainFogD:.0148}""",
"""   rainSky:['#1c2735','#2b3848','#3e4c5c','rgba(150,170,196,.22)'],rainFog:0x2c3846,rainFogD:.0118}""")

# 5.2 白天雨天：方向光砍得没那么狠，环境光/半球光抬起来
rep("""    if(rainy){key.color.setHex(0xb4c0cc);key.intensity*=.55;}""",
"""    if(rainy){key.color.setHex(0xc2cdd8);key.intensity*=.72;}""")
rep("""    ambient.color.setHex(rainy?0x93a2b0:(sunset?0xb998a8:dawn?0xb8a4ba:0xb5cde3));""",
"""    ambient.color.setHex(rainy?0xa9b7c4:(sunset?0xb998a8:dawn?0xb8a4ba:0xb5cde3));""")
rep("""    ambient.intensity=rainy?.96:((sunset||dawn)?.78:.88);""",
"""    ambient.intensity=rainy?1.30:((sunset||dawn)?.78:.88);""")
rep("""    hemi.color.setHex(rainy?0x9aa6b2:(sunset?0xe8a088:dawn?0xdfa8b0:0xafd0f0));""",
"""    hemi.color.setHex(rainy?0xbcc8d4:(sunset?0xe8a088:dawn?0xdfa8b0:0xafd0f0));""")
rep("""    hemi.groundColor.setHex(rainy?0x4c5259:(sunset?0x50404c:0x788a9a));""",
"""    hemi.groundColor.setHex(rainy?0x606a74:(sunset?0x50404c:0x788a9a));""")
rep("""    hemi.intensity=rainy?1.02:.92;""",
"""    hemi.intensity=rainy?1.44:.92;""")
rep("""    skylineMats.forEach(m=>{m.emissiveIntensity=rainy?.16:((sunset||dawn)?.35:.08);});""",
"""    skylineMats.forEach(m=>{m.emissiveIntensity=rainy?.30:((sunset||dawn)?.35:.08);});""")

# 5.3 夜雨：阴天的夜比晴夜亮（云把地面光反下来），之前反而比晴夜更暗
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

# 5.4 雨天地面：湿雪地不是深灰，是被阴天天光照亮的浅灰
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

# 5.5 雨天曝光补一档：阴天整体本来就该亮一档
rep("""  renderer.toneMappingExposure=state.quality?(IS_TOUCH_DEV?1.14:1.12):1.06;""",
"""  renderer.toneMappingExposure=(state.quality?(IS_TOUCH_DEV?1.14:1.12):1.06)*(state.weather==='rain'?1.10:1);""")
rep("""  sfx.setRain(rainy?1:0);
  applyTime(state.hour);      // 天空/雾/灯光随天气一起换""",
"""  sfx.setRain(rainy?1:0);
  renderer.toneMappingExposure=(state.quality?(IS_TOUCH_DEV?1.14:1.12):1.06)*(rainy?1.10:1);
  applyTime(state.hour);      // 天空/雾/灯光随天气一起换""")

# 5.6 雨天地面乘法光池别压太狠（湿地面反光更强）
rep("""    if(rainLevel>0)MUL_GLOW_K*=.60;""",
"""    if(rainLevel>0)MUL_GLOW_K*=.78;""")

io.open(P,'w',encoding='utf-8').write(s)
print('OK  env edits,  %d -> %d bytes'%(len(orig),len(s)))
