#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把游乐场经济系统（雪币/票价/固定上车光点/打工）打进 xiongmeng-art-museum.html"""
import io, re, sys, pathlib

ROOT = pathlib.Path("/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace")
F = ROOT / "xiongmeng-art-museum.html"
BLOCK = (ROOT / "tools/xm-studio/econ_block.js").read_text(encoding="utf-8")

s = F.read_text(encoding="utf-8")
orig_len = len(s)

# ─────────────────────────── 1. CSS ───────────────────────────
CSS = """
  /* ---------- 左上角：雪币钱包（经济系统常驻，纯净模式也看得见） ---------- */
  #wallet{
    position:fixed;left:12px;top:14px;z-index:29;display:flex;align-items:center;gap:7px;
    padding:6px 12px;font-family:var(--mono);font-size:12px;color:var(--ink);letter-spacing:.03em;
  }
  #wallet .w-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);flex:none;
    box-shadow:0 0 10px rgba(244,197,106,.85)}
  #wallet b{font-size:15px;color:var(--accent);font-weight:600;min-width:20px;text-align:right}
  #wallet span{font-family:var(--han);font-size:11px;color:var(--muted)}
  #wallet em{font-style:normal;font-family:var(--han);font-size:10px;color:var(--muted);
    padding-left:9px;border-left:1px solid var(--line)}
  /* ---------- 摄影取景框 ---------- */
  #photo-hud{position:fixed;inset:0;z-index:27;display:none;pointer-events:none}
  #photo-hud.show{display:block}
  #ph-frame{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:min(48vw,340px);height:min(36vw,250px);
    border:1px solid rgba(255,255,255,.20);border-radius:3px;
    box-shadow:0 0 0 1px rgba(0,0,0,.30),0 20px 60px rgba(0,0,0,.45)}
  #ph-frame s{position:absolute;width:26px;height:26px;border:2px solid var(--accent);display:block}
  #ph-frame s:nth-child(1){left:-2px;top:-2px;border-right:0;border-bottom:0}
  #ph-frame s:nth-child(2){right:-2px;top:-2px;border-left:0;border-bottom:0}
  #ph-frame s:nth-child(3){left:-2px;bottom:-2px;border-right:0;border-top:0}
  #ph-frame s:nth-child(4){right:-2px;bottom:-2px;border-left:0;border-top:0}
  #ph-dot{position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;
    border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent)}
  #ph-bar{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);display:flex;gap:14px;
    align-items:center;padding:8px 16px;border-radius:20px;background:rgba(10,18,26,.84);
    border:1px solid var(--line-strong);font-family:var(--han);font-size:12px;color:#eaf4ff;
    white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.45)}
  #ph-key{color:var(--muted);font-size:11px}
  #photo-flash{position:fixed;inset:0;z-index:60;pointer-events:none;background:#fff;opacity:0}
  #photo-flash.on{animation:phflash .34s ease-out}
  @keyframes phflash{0%{opacity:.92}100%{opacity:0}}
"""
anchor = "  #train-hud.show{display:flex}\n"
assert anchor in s, "css anchor missing"
s = s.replace(anchor, anchor + CSS, 1)

# ── 左上角钱包占了 top:14，rail 整体往下挪 38px ──
old_rail = """  #rail{
    position:fixed;left:12px;top:14px;z-index:29;"""
new_rail = """  #rail{
    position:fixed;left:12px;top:52px;z-index:29;"""
assert old_rail in s, "rail anchor missing"
s = s.replace(old_rail, new_rail, 1)

# ─────────────────────────── 2. HTML ───────────────────────────
HTML = """<div id="wallet" class="panel"><i class="w-dot"></i><b id="w-coin">60</b><span>雪币</span><em id="w-sub">打工 0</em></div>
<div id="photo-hud"><div id="ph-frame"><s></s><s></s><s></s><s></s><span id="ph-dot"></span></div><div id="ph-bar"><span id="ph-state">等客人站好…</span><span id="ph-key">空格 拍照 · E 收摊</span></div></div>
<div id="photo-flash"></div>
"""
anchor = '<div id="train-hud">'
assert anchor in s, "html anchor missing"
s = s.replace(anchor, HTML + anchor, 1)

# ─────────────────────────── 3. JS 模块 ───────────────────────────
JS = BLOCK + "\n\neconBuildAll();\neconBuildWrapBox();\n"
anchor = "/* 全部建完 → 撤 boot 遮罩（一次成型，不给用户看半成品场景） */"
assert anchor in s, "js anchor missing"
s = s.replace(anchor, JS + "\n" + anchor, 1)

# 包装台上的礼物盒会缩放，不能被自动合批冻住
old = "  g.scale.setScalar(.001);g.visible=false;\n  econWrapBox.g=g;"
new = "  g.scale.setScalar(.001);g.visible=false;\n  g.userData.keep=true;\n  econWrapBox.g=g;"
assert old in s
s = s.replace(old, new, 1)

# ─────────────────────────── 4. 主循环挂接 ───────────────────────────
old = "  updateFireworks(dt);\n"
assert old in s
s = s.replace(old, old + "  econUpdate(dt);\n", 1)

# ─────────────────────────── 5. KeyE 改造 ───────────────────────────
old = """  if(e.code==='KeyE'){
    if(heliSys.riding){heliSys.fast=true;return;}
    if(heliNearPlayer()){toggleHeliRide();return;}
    if(balloonSys.riding){stopBalloonRide();return;}
    const _bNear=balloonNearPlayer();
    if(_bNear>=0){toggleBalloonRide(_bNear);return;}
    if(wheelSys.riding){toggleRideWheel(null);return;}
    if(trainSys.riding){toggleRideTrain();return;}
    if(fp.on&&Math.hypot(fp.x-27,fp.z-36)<10.5){toggleRideWheel(null);return;}
    if(fp.on&&trainCars.some(c=>Math.hypot(fp.x-c.position.x,fp.z-c.position.z)<9.5)){toggleRideTrain();return;}
    if(fp.on&&Math.hypot(fp.x-pianoPlaza.px,fp.z-pianoPlaza.pz)<4.8){pianoPlay();return;}
  }"""
new = """  if(e.code==='KeyE'){
    if(heliSys.riding){heliSys.fast=true;return;}
    if(balloonSys.riding){stopBalloonRide();return;}
    if(photoSys.on){econPhotoStop();return;}
    if(wheelSys.riding){toggleRideWheel(null);return;}
    if(trainSys.riding){toggleRideTrain();return;}
    /* 设施必须站到固定的上车光点才让上；打工位在光点里按 E 开工 */
    if(econInteract())return;
    if(fp.on&&Math.hypot(fp.x-pianoPlaza.px,fp.z-pianoPlaza.pz)<4.8){pianoPlay();return;}
  }
  if(e.code==='Space'&&photoSys.on){e.preventDefault();econPhotoShoot();return;}"""
assert old in s, "KeyE anchor missing"
s = s.replace(old, new, 1)

# ─────────────────────────── 6. 点击设施 → 引导到光点 + 收费 ───────────────────────────
old = """  if(type==='wheel'){
    toggleRideWheel(ref);
    return true;
  }
  if(type==='ride'){
    toggleRideFacility(ref);
    return true;
  }
  if(type==='launch'){
    startLaunchRide();
    return true;
  }
  if(type==='balloon'){
    toggleBalloonRide(ref);
    return true;
  }"""
new = """  if(type==='wheel'){
    econClickRide('wheel');
    return true;
  }
  if(type==='ride'){
    econClickRide(ref&&ref.kind);
    return true;
  }
  if(type==='launch'){
    econClickRide('launch');
    return true;
  }
  if(type==='balloon'){
    econClickRide('balloon');
    return true;
  }"""
assert old in s, "triggerPhys anchor missing"
s = s.replace(old, new, 1)

# ─────────────────────────── 7. 删掉旧的「走近就能上」提示 ───────────────────────────
# 7.1 摩天轮
old = """    const dw=Math.hypot(fp.x-27,fp.z-36);
    if(dw<10.5){
      hudShow('敞篷观景摩天轮 · 按 E 或点击坐上吊篮','坐摩天轮 (E)',()=>toggleRideWheel(null));
    }
"""
assert old in s, "wheel hud anchor missing"
s = s.replace(old, "", 1)

# 7.2 热气球
old = """  /* 靠近提示：站着不动也能上球 */
  if(!balloonSys.riding&&fp.on&&!wheelSys.riding&&!trainSys.riding&&!launchSys.active&&!heliSys.riding){
    const i=balloonNearPlayer();
    if(i>=0){
      hudShow('大号热气球 · 按 E 或点击登上吊篮（升空后 W/↑ 上升、S/↓ 下降）','上热气球 (E)',()=>toggleBalloonRide(i));
      balloons[i].hud=true;
    }
  }
"""
assert old in s, "balloon hud anchor missing"
s = s.replace(old, "", 1)

# 7.3 直升机
old = """    /* 停机坪上的走近提示 */
    if(fp.on&&!balloonSys.riding&&!wheelSys.riding&&!trainSys.riding&&!launchSys.active){
      if(heliNearPlayer()){
        hudShow('停机坪 · 直升机 · 按 E 或点击登机（起飞后绕园区一圈再落地）','登机 (E)',()=>toggleHeliRide());
        heliSys.hud=true;
      }
    }
"""
assert old in s, "heli hud anchor missing"
s = s.replace(old, "", 1)

# 7.4 小火车：改成只在光点候车
old = """  }else if(fp.on){
    const nearCar=trainCars.some(c=>Math.hypot(fp.x-c.position.x,fp.z-c.position.z)<9.5);
    if(nearCar){
      hudShow('🚂 皇家冬夜加长特快经过身旁 · 点击车厢或按 E 随时上车','上车 (E)',()=>toggleRideTrain());
    }else{
      hudHide();
    }
  }else{"""
new = """  }else if(fp.on){
    /* 上车改走固定光点：站到候车点等车，进站了才让上（票价 10 雪币） */
    if(!econAtPad('train'))hudHide();
  }else{"""
assert old in s, "train hud anchor missing"
s = s.replace(old, new, 1)

# ─────────────────────────── 8. 拍照时别跳 ───────────────────────────
old = "  if(fp.keys['Space']&&fp.jumpY<=0.001){"
assert old in s
s = s.replace(old, "  if(fp.keys['Space']&&fp.jumpY<=0.001&&!photoSys.on){", 1)

# ─────────────────────────── 9. 补两个小函数（点击引导 / E 交互）───────────────────────────
EXTRA = """
/* ── 经济系统：点设施时的引导（没站到光点就告诉你去哪儿）── */
function econClickRide(kind){
  const R=econRideByKind(kind);
  if(!R){_recMsg('这个设施现在不开放',1600);return;}
  const pad=econRideById(R.id);
  if(pad&&!econAtPad(pad.id)){
    const d=Math.hypot(fp.x-pad.x,fp.z-pad.z);
    _recMsg('请走到发光的【'+pad.name+'上车点】再上车（还有 '+d.toFixed(0)+' 米）',2600);
    sfx.blip(420,.12,.07);
    return;
  }
  if(R.id==='sleigh'){
    if(ECON.coin<R.price){_recMsg('雪币不够：驯鹿雪橇票价 '+R.price+' 雪币',2400);sfx.blip(300,.16,.09);return;}
    econPay(R.price);
    toggleRideFacility({kind:'sleigh',label:'空中圣诞驯鹿雪橇'});
    return;
  }
  econBoard(R.id);
}
/* ── 经济系统：E 键统一入口（上车点 / 工位）── */
function econInteract(){
  if(!fp.on)return false;
  const job=econNearestJob();
  if(job){econJobDo(job.id);return true;}
  const pad=econNearestPad();
  if(pad){econBoard(pad.id);return true;}
  return false;
}
"""
anchor = "/* ── 经济系统：点设施时的引导"
# 插到 JS 模块末尾（econJobDo 后面）
tail = """function econJobDo(id){
  if(id==='ticket')econSellTicket();
  else if(id==='photo')econPhotoStart();
  else if(id==='wrap')econWrapGift();
}
"""
assert tail in s, "econJobDo anchor missing"
s = s.replace(tail, tail + EXTRA, 1)

F.write_text(s, encoding="utf-8")
print("patched: %d -> %d bytes" % (orig_len, len(s)))
