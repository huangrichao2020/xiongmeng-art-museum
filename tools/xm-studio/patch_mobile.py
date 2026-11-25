#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""手机兼容 + 雪币进个人面板 + 工位改成上岗模式"""
import pathlib

W = pathlib.Path("/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace")
F = W / "xiongmeng-art-museum.html"
s = F.read_text(encoding="utf-8")
n0 = len(s)

def rep(old, new, tag):
    global s
    assert old in s, "MISS: " + tag
    assert s.count(old) == 1, "DUP(%d): %s" % (s.count(old), tag)
    s = s.replace(old, new, 1)
    print("ok", tag)

# ══════════════════ 1. CSS：钱包样式改成个人面板角标 ══════════════════
old_css = """  /* ---------- 左上角：雪币钱包（经济系统常驻，纯净模式也看得见） ---------- */
  #wallet{
    position:fixed;left:12px;top:14px;z-index:29;display:flex;align-items:center;gap:7px;
    padding:6px 12px;font-family:var(--mono);font-size:12px;color:var(--ink);letter-spacing:.03em;
  }
  #wallet .w-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);flex:none;
    box-shadow:0 0 10px rgba(244,197,106,.85)}
  #wallet b{font-size:15px;color:var(--accent);font-weight:600;min-width:20px;text-align:right}
  #wallet span{font-family:var(--han);font-size:11px;color:var(--muted)}
  #wallet em{font-style:normal;font-family:var(--han);font-size:10px;color:var(--muted);
    padding-left:9px;border-left:1px solid var(--line)}"""
new_css = """  /* ---------- 雪币：收进右上「个人」面板里 ---------- */
  .mp-coin{
    display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:11px;flex:none;
    background:linear-gradient(180deg,#ffe6a8,#f4c56a);color:#5a3d12;
    font-family:var(--mono);font-size:11px;font-weight:800;letter-spacing:.02em;
    box-shadow:0 2px 0 rgba(150,105,30,.35);
  }
  .mp-coin::before{content:'';width:7px;height:7px;border-radius:50%;background:#fff3d0;flex:none;
    box-shadow:0 0 0 2px rgba(255,255,255,.45)}
  /* 还没登录（个人面板没出现）时，单独挂在左上角，不跟 ≡ 圆钮打架 */
  #mp-coin.float{
    position:fixed;left:12px;top:14px;z-index:29;padding:5px 11px;font-size:12px;
    background:rgba(9,16,24,.84);border:1px solid var(--line);color:var(--accent);
    backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  }
  #mp-coin.float::before{background:var(--accent);box-shadow:0 0 8px rgba(244,197,106,.9)}
  body.wallet-float #rail{top:52px}
  /* 手机端：交互提示条上的按钮做大，拇指点得中 */
  body.touch #train-hud{padding:9px 12px}
  body.touch #train-hud button{padding:11px 18px;font-size:13px;border-radius:16px}
  /* 手机端：摄影摊的快门按钮（手机上没有空格键） */
  #ph-shoot{
    position:fixed;right:max(18px,env(safe-area-inset-right));bottom:170px;z-index:28;
    display:none;width:78px;height:78px;border-radius:50%;
    background:rgba(244,197,106,.92);border:2px solid rgba(255,255,255,.75);
    color:#241704;font-family:var(--han);font-size:14px;font-weight:800;letter-spacing:.06em;
    box-shadow:0 6px 20px rgba(0,0,0,.5);touch-action:none;cursor:pointer;
  }
  #ph-shoot.on{display:block}
  #ph-shoot:active{transform:scale(.94)}"""
rep(old_css, new_css, "wallet css")

# rail 复位（没登录时才下移）
rep("""  #rail{
    position:fixed;left:12px;top:52px;z-index:29;""",
    """  #rail{
    position:fixed;left:12px;top:14px;z-index:29;""", "rail top back")

# ══════════════════ 2. HTML：删掉独立钱包，加快门按钮 ══════════════════
rep("""<div id="wallet" class="panel"><i class="w-dot"></i><b id="w-coin">60</b><span>雪币</span><em id="w-sub">打工 0</em></div>
<div id="photo-hud"><div id="ph-frame"><s></s><s></s><s></s><s></s><span id="ph-dot"></span></div><div id="ph-bar"><span id="ph-state">等客人站好…</span><span id="ph-key">空格 拍照 · E 收摊</span></div></div>
<div id="photo-flash"></div>
""",
"""<div id="photo-hud"><div id="ph-frame"><s></s><s></s><s></s><s></s><span id="ph-dot"></span></div><div id="ph-bar"><span id="ph-state">等客人站好…</span><span id="ph-key">空格 拍照 · E 收摊</span></div></div>
<button id="ph-shoot" data-label="拍照">拍照</button>
<div id="photo-flash"></div>
""", "html wallet/shoot")

# ══════════════════ 3. 个人面板：加雪币角标 + 两行 ══════════════════
rep("""      <button id="mp-me-btn" title="个人信息">
        <span class="mp-avatar" id="mp-me-av">?</span>
        <span>个人</span>
        <span class="mp-cnt" id="mp-cnt"></span>
      </button>""",
"""      <button id="mp-me-btn" title="个人信息">
        <span class="mp-avatar" id="mp-me-av">?</span>
        <span>个人</span>
        <span class="mp-coin" id="mp-coin">0</span>
        <span class="mp-cnt" id="mp-cnt"></span>
      </button>""", "panel badge")

rep("""        <div class="mp-field"><b>账号</b><span id="mp-acc-t">-</span></div>
        <div class="mp-field"><b>ID</b><span id="mp-id-t">-</span></div>""",
"""        <div class="mp-field"><b>账号</b><span id="mp-acc-t">-</span></div>
        <div class="mp-field"><b>ID</b><span id="mp-id-t">-</span></div>
        <div class="mp-field"><b>雪币</b><span id="mp-coin-t">0</span></div>
        <div class="mp-field"><b>打工</b><span id="mp-earn-t">0</span></div>""", "panel rows")

# ══════════════════ 4. 经济模块：钱包输出 + 上岗模式 ══════════════════
rep("""const econCoinEl=document.getElementById('w-coin');
const econSubEl=document.getElementById('w-sub');""",
"""const econCoinEl=document.getElementById('mp-coin');
const econCoinTxtEl=document.getElementById('mp-coin-t');
const econEarnEl=document.getElementById('mp-earn-t');
const phShootBtn=document.getElementById('ph-shoot');
if(phShootBtn)phShootBtn.onclick=()=>econPhotoShoot();""", "econ els")

rep("""function econPaint(){
  if(econCoinEl)econCoinEl.textContent=String(ECON.coin);
  if(econSubEl)econSubEl.textContent='打工 +'+ECON.earned;
}""",
"""function econPaint(){
  if(econCoinEl)econCoinEl.textContent=String(ECON.coin);
  if(econCoinTxtEl)econCoinTxtEl.textContent=String(ECON.coin)+' 枚';
  if(econEarnEl)econEarnEl.textContent='+'+ECON.earned+' 雪币';
  econMountCoin();
}
/* 雪币挂哪：个人面板出现了就塞进「个人」按钮当角标；
   还没登录（面板隐藏）就单独浮在左上角，跟 ≡ 圆钮错开。 */
function econMountCoin(){
  const el=document.getElementById('mp-coin');
  if(!el)return;
  const panel=document.getElementById('mp-panel');
  const btn=document.getElementById('mp-me-btn');
  const shown=!!(panel&&panel.style.display!=='none');
  if(shown&&btn){
    if(el.parentElement!==btn)btn.appendChild(el);
    el.classList.remove('float');
    document.body.classList.remove('wallet-float');
  }else{
    if(el.parentElement!==document.body)document.body.appendChild(el);
    el.classList.add('float');
    document.body.classList.add('wallet-float');
  }
}""", "econ paint")

# 卖票 → 改成上岗后自动来客人
rep("""/* ── 打工 ①：售票处卖票 ────────────────────────────────── */
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
}""",
"""/* ── 上岗：站到工位按 E 开始干活，客人自己会过来 ────────── */
const ECON_SHIFT={id:null,t:0,next:0};
function econShiftId(){
  if(photoSys.on)return 'photo';
  return ECON_SHIFT.id;
}
function econJobStart(id){
  const J=ECON_JOBS.find(j=>j.id===id);
  if(!J)return;
  if(id==='photo'){econPhotoStart();return;}
  ECON_SHIFT.id=id;ECON_SHIFT.t=0;ECON_SHIFT.next=.6;
  econLastPrompt='';
  _recMsg(J.name+' · 开始上岗，客人会自己过来找你',3000);
  sfx.blip(760,.10,.07);
}
function econJobStop(){
  if(photoSys.on){econPhotoStop();econLastPrompt='';return;}
  if(!ECON_SHIFT.id)return;
  ECON_SHIFT.id=null;
  if(ECON.ticketBuyer){econFreeNpc(ECON.ticketBuyer);ECON.ticketBuyer=null;}
  econLastPrompt='';
  _recMsg('已下班',1600);
  hudHide();
}""", "shift funcs")

rep("""function econJobDo(id){
  if(id==='ticket')econSellTicket();
  else if(id==='photo')econPhotoStart();
  else if(id==='wrap')econWrapGift();
}""",
"""function econJobDo(id){econJobStart(id);}""", "jobDo -> start")

# 上岗期间的自动接客（售票 / 包装）
rep("""  /* 买票的客人走到窗口就成交 */
  if(ECON.ticketBuyer){""",
"""  /* 上岗中：客人自己过来 */
  const _shift=econShiftId();
  if(_shift&&fp.on){
    const J=ECON_JOBS.find(j=>j.id===_shift);
    if(J&&Math.hypot(fp.x-J.gx,fp.z-J.gz)>9){
      econJobStop();
    }else if(J){
      ECON_SHIFT.t+=dt;
      if(_shift==='ticket'&&!ECON.ticketBuyer&&ECON_SHIFT.t>ECON_SHIFT.next){
        const n=econPickNpc(J.bx,J.bz,7,30);
        if(n){
          econSendNpc(n,J.gx,J.gz+.4);
          n.job={type:'ticket',x:J.gx,z:J.gz+.4,t:0};
          ECON.ticketBuyer=n;
        }
        ECON_SHIFT.next=ECON_SHIFT.t+R(3.0,5.4);
      }else if(_shift==='wrap'&&ECON_SHIFT.t>ECON_SHIFT.next){
        econGain(12,'包好一份圣诞礼物');
        if(econWrapBox.g){econWrapBox.on=true;econWrapBox.t=0;}
        ECON_SHIFT.next=ECON_SHIFT.t+R(2.4,4.0);
      }
    }
  }
  /* 买票的客人走到窗口就成交 */
  if(ECON.ticketBuyer){""", "shift tick")

# 提示条：优先显示上岗状态，文案按设备分
rep("""  const job=econNearestJob();
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
  }""",
"""  const job=econNearestJob();
  const pad=econNearestPad();
  const shift=econShiftId();
  const TOUCH=IS_TOUCH_DEV;
  let key='',msg='',btn='',fn=null;
  if(shift){
    const J=ECON_JOBS.find(j=>j.id===shift);
    key='shift:'+shift;
    msg=J.name+' · 上岗中'+(shift==='photo'
      ?(TOUCH?' · 客人站好了就点右下角快门':' · 客人站好了就按 空格 拍照')
      :' · 客人正在赶来');
    btn=TOUCH?'下班':'下班 (E)';
    fn=()=>econJobStop();
  }else if(job){
    key='job:'+job.id;
    msg=job.name+' · '+job.tip+'（'+job.pay+' 雪币）'+(TOUCH?' · 点按钮上岗':' · 按 E 上岗');
    btn=TOUCH?'上岗':'上岗 (E)';
    fn=()=>econJobDo(job.id);
  }else if(pad){
    key='pad:'+pad.id;
    msg=pad.id==='train'
      ?'皇家冬夜加长特快 · 票价 10 雪币 · 在光点上等车，小火车进站后按 E 上车'
      :pad.name+' · 票价 '+pad.price+' 雪币 · '+(TOUCH?'点按钮上车':'按 E 上车');
    btn='上车 ('+pad.price+')';
    fn=()=>econBoard(pad.id);
  }""", "prompt text")

# 上岗时 E 键：先下班 / 换班
rep("""function econInteract(){
  if(!fp.on)return false;
  const job=econNearestJob();
  if(job){econJobDo(job.id);return true;}
  const pad=econNearestPad();
  if(pad){econBoard(pad.id);return true;}
  return false;
}""",
"""function econInteract(){
  if(!fp.on)return false;
  const shift=econShiftId();
  if(shift){
    /* 站在别的工位旁边 → 直接换班；否则按 E 下班 */
    const jb=econNearestJob();
    if(jb&&jb.id!==shift){econJobStop();econJobStart(jb.id);return true;}
    econJobStop();
    return true;
  }
  const job=econNearestJob();
  if(job){econJobDo(job.id);return true;}
  const pad=econNearestPad();
  if(pad){econBoard(pad.id);return true;}
  return false;
}""", "econInteract")

# 摄影模式：手机端显示快门按钮
rep("""  if(photoHudEl)photoHudEl.classList.add('show');
  if(phStateEl)phStateEl.textContent='等客人走过来…';""",
"""  if(photoHudEl)photoHudEl.classList.add('show');
  if(phShootBtn)phShootBtn.classList.add('on');
  if(phStateEl)phStateEl.textContent='等客人走过来…';""", "shoot btn on")

rep("""  if(photoHudEl)photoHudEl.classList.remove('show');
  hudHide();""",
"""  if(photoHudEl)photoHudEl.classList.remove('show');
  if(phShootBtn)phShootBtn.classList.remove('on');
  hudHide();""", "shoot btn off")

# ══════════════════ 5. 手机动态摇杆：左半屏按住即出现摇杆 ══════════════════
rep("""renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse')return;   // 鼠标交给 document 的 mousemove
  // 触屏沙盒：相机旋转由 fp.yaw/pitch 接管，挡住 OrbitControls 的 pointerdown，
  // 否则两者同时转 → 视角乱跳。缩放仍交给 controls。
  lookPts.set(e.pointerId,{x:e.clientX,y:e.clientY,resync:false});""",
"""renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse')return;   // 鼠标交给 document 的 mousemove
  /* 手机：左半屏 = 移动区（手指按在哪，虚拟摇杆就出现在哪）；
     右半屏 = 转视角。
     原来整屏单指都是转头，手机上根本没法走路 —— 左下角那颗固定摇杆
     又小又靠边，很多人根本不知道有它。左半屏动态摇杆才符合手机习惯。 */
  const isMove=fp.on&&e.clientX<innerWidth*0.5;
  lookPts.set(e.pointerId,{x:e.clientX,y:e.clientY,resync:false,kind:isMove?'move':'look'});
  if(isMove)joyShowAt(e.clientX,e.clientY);""", "pointerdown move zone")

rep("""  if(lookPts.size===1){
    const _bd=wheelSys.bump;""",
"""  if(p.kind==='move'){
    /* 移动区：位移直接喂给虚拟摇杆 */
    p.x=e.clientX;p.y=e.clientY;
    joyApply(e.clientX,e.clientY);
    return;
  }
  if(lookPts.size===1){
    const _bd=wheelSys.bump;""", "pointermove move zone")

rep("""function lookEnd(e){
  if(!lookPts.has(e.pointerId))return;
  lookPts.delete(e.pointerId);""",
"""function lookEnd(e){
  if(!lookPts.has(e.pointerId))return;
  const _p=lookPts.get(e.pointerId);
  if(_p&&_p.kind==='move')joyHide();
  lookPts.delete(e.pointerId);""", "lookEnd hide")

rep("""function joyReset(){joy.active=false;joy.dx=joy.dy=joy.mag=0;stickEl.style.transform='translate(0,0)';}""",
"""function joyReset(){joy.active=false;joy.dx=joy.dy=joy.mag=0;stickEl.style.transform='translate(0,0)';}
/* 动态摇杆：左半屏按住时，把摇杆挪到手指底下；松手归位 */
function joyShowAt(x,y){
  const r=joyEl.getBoundingClientRect().width/2;
  joy.active=true;joy.cx=x;joy.cy=y;joy.src='screen';
  joyEl.style.left=(x-r)+'px';
  joyEl.style.top=(y-r)+'px';
  joyEl.style.right='auto';joyEl.style.bottom='auto';
  joyApply(x,y);
}
function joyHide(){
  joyReset();joy.src='';
  joyEl.style.left='';joyEl.style.top='';joyEl.style.right='';joyEl.style.bottom='';
}""", "joy dynamic funcs")

rep("""  joy.active=true;joy.cx=r.x+r.width/2;joy.cy=r.y+r.height/2;
  joyApply(e.clientX,e.clientY);""",
"""  joy.active=true;joy.src='pad';joy.cx=r.x+r.width/2;joy.cy=r.y+r.height/2;
  joyApply(e.clientX,e.clientY);""", "joy src pad")

F.write_text(s, encoding="utf-8")
print("patched %d -> %d" % (n0, len(s)))
