/* ════════════════════════════════════════════════════════════
   多人联机 · 前端模块（熊萌艺术馆）
   —— 账号登录 / 同号踢出 / 可改显示 ID / 远端玩家同步
   —— 第三人称模式（角色模型 + 弹簧跟随相机）
   依赖全局：THREE / scene / camera / fp / XM / sfx
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MP = {
    ws: null, account: '', display: '', connected: false,
    peers: new Map(),          // account -> {display, target:{x,y,z,yaw}, cur:{...}, group, tag}
    self: null,                // 本地第三人称角色
    third: false,              // 是否第三人称
    camDist: 4.6, camHeight: 2.05, camSide: 0.55,
    lastSend: 0, sendHz: 15,
    reconnectAt: 0, tries: 0,
    onKicked: null,
  };
  window.MP = MP;

  /* ── WebSocket URL：同源 wss ── */
  function wsURL() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/alex-garage/ws/';
  }

  /* ══════════════════════════════════════════════════════
     登录界面
     ══════════════════════════════════════════════════════ */
  function buildLoginUI() {
    if (document.getElementById('mp-login')) return;
    const wrap = document.createElement('div');
    wrap.id = 'mp-login';
    wrap.innerHTML = `
      <div class="mp-card">
        <div class="mp-title">熊萌艺术馆</div>
        <div class="mp-sub">圣诞冰雪特展 · 联机入口</div>
        <label class="mp-row"><span>账号</span>
          <input id="mp-acc" type="text" autocomplete="username" placeholder="test01" maxlength="20">
        </label>
        <label class="mp-row"><span>密码</span>
          <input id="mp-pass" type="password" autocomplete="current-password" placeholder="123456" maxlength="20">
        </label>
        <div class="mp-quick">
          <button data-a="test01" data-p="123456">test01</button>
          <button data-a="test02" data-p="123456">test02</button>
        </div>
        <button id="mp-go" class="mp-go">进入展厅</button>
        <div class="mp-msg" id="mp-msg"></div>
      </div>`;
    document.body.appendChild(wrap);
    const msg = wrap.querySelector('#mp-msg');
    const acc = wrap.querySelector('#mp-acc');
    const pass = wrap.querySelector('#mp-pass');

    wrap.querySelectorAll('.mp-quick button').forEach(b => {
      b.onclick = () => { acc.value = b.dataset.a; pass.value = b.dataset.p; msg.textContent = ''; };
    });
    wrap.querySelector('#mp-go').onclick = () => {
      const a = acc.value.trim(), p = pass.value;
      if (!a || !p) { msg.textContent = '请填写账号和密码'; return; }
      msg.textContent = '连接中…';
      msg.className = 'mp-msg';
      MP.connect(a, p);
    };
    [acc, pass].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') wrap.querySelector('#mp-go').click(); });
    });
    MP._ui = { wrap, msg, acc, pass };
  }

  function setMsg(txt, kind) {
    if (!MP._ui) return;
    MP._ui.msg.textContent = txt;
    MP._ui.msg.className = 'mp-msg' + (kind ? ' ' + kind : '');
  }

  function hideLogin() {
    if (MP._ui) MP._ui.wrap.classList.add('hide');
  }
  function showLogin() {
    if (MP._ui) { MP._ui.wrap.classList.remove('hide'); setMsg(''); }
  }

  /* ══════════════════════════════════════════════════════
     连接
     ══════════════════════════════════════════════════════ */
  MP.connect = function (account, pass) {
    MP.account = account; MP._pass = pass;
    if (MP.ws) { try { MP.ws.close(); } catch (e) { } }
    let ws;
    try { ws = new WebSocket(wsURL()); }
    catch (e) { setMsg('无法建立连接：' + e.message, 'err'); return; }
    MP.ws = ws;

    ws.onopen = () => {
      MP.tries = 0;
      ws.send(JSON.stringify({ t: 'login', account, pass }));
    };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      MP.onMsg(m);
    };
    ws.onclose = () => {
      MP.connected = false;
      MP.clearPeers();
      if (MP.onKicked) { MP.onKicked(); return; }
      MP.tries++;
      const wait = Math.min(8000, 1200 * MP.tries);
      setMsg('连接断开，' + Math.round(wait / 1000) + ' 秒后重连…', 'err');
      clearTimeout(MP._rt);
      MP._rt = setTimeout(() => { MP.connect(MP.account, MP._pass); }, wait);
    };
    ws.onerror = () => { };
  };

  MP.send = function (o) {
    if (MP.ws && MP.ws.readyState === 1) {
      try { MP.ws.send(JSON.stringify(o)); } catch (e) { }
    }
  };

  MP.onMsg = function (m) {
    switch (m.t) {
      case 'welcome': {
        MP.connected = true;
        MP.display = m.you.display || MP.account;
        setMsg('');
        hideLogin();
        MP.clearPeers();
        (m.players || []).forEach(pl => {
          if (pl.account !== MP.account) MP.addPeer(pl);
        });
        MP.syncPeersUI();
        MP.startThirdPersonBody();
        if (window.MP_UI) MP_UI.onLogin(m.you);
        break;
      }
      case 'players': {
        (m.players || []).forEach(pl => {
          if (pl.account === MP.account) return;
          const ex = MP.peers.get(pl.account);
          if (ex) { ex.display = pl.display; ex.target = pl.p; ex.mode = pl.mode; }
          else MP.addPeer(pl);
        });
        // 移除已下线的
        const alive = new Set((m.players || []).map(x => x.account));
        for (const acc of [...MP.peers.keys()]) {
          if (!alive.has(acc)) MP.removePeer(acc);
        }
        MP.syncPeersUI();
        break;
      }
      case 'move': {
        const p = MP.peers.get(m.account);
        if (p) {
          p.display = m.display || p.display;
          p.target = m.p;
          p.mode = m.mode || 'fp';
          p.lastSeen = performance.now();
        }
        break;
      }
      case 'rename': {
        const p = MP.peers.get(m.account);
        if (p) { p.display = m.display; refreshTag(p); }
        MP.syncPeersUI();
        break;
      }
      case 'kicked': {
        MP.onKicked = function () {
          MP.onKicked = null;
          MP.connected = false;
          MP.clearPeers();
          showLogin();
          setMsg('该账号在别处登录，已被踢下线', 'err');
        };
        MP.onKicked();
        break;
      }
      case 'err': {
        setMsg(m.msg || '登录失败', 'err');
        MP.onKicked = null;   // 防止 close 时反复重连
        try { MP.ws.close(); } catch (e) { }
        MP.ws = null;
        break;
      }
      case 'chat': {
        if (window.MP_UI) MP_UI.pushChat(m);
        break;
      }
    }
  };

  /* ══════════════════════════════════════════════════════
     远端玩家
     ══════════════════════════════════════════════════════ */
  function makeTagSprite(text, color) {
    const c = document.createElement('canvas');
    const w = 256, h = 64;
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    x.font = '600 30px system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const tw = Math.min(w - 12, x.measureText(text).width + 34);
    const bx = (w - tw) / 2;
    x.fillStyle = 'rgba(12,16,22,.72)';
    roundRect(x, bx, 12, tw, 40, 10); x.fill();
    x.strokeStyle = color; x.lineWidth = 2;
    roundRect(x, bx, 12, tw, 40, 10); x.stroke();
    x.fillStyle = '#f2f7ff';
    x.fillText(text, w / 2, 33, w - 24);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(1.5, 0.375, 1);
    sp.renderOrder = 999;
    return sp;
  }
  function roundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }

  const PEER_COLORS = [0x6fd3ff, 0xffb35c, 0x8be28f, 0xff8fb0, 0xc9a2ff];
  let peerColorIdx = 0;

  MP.addPeer = function (pl) {
    if (MP.peers.has(pl.account)) return;
    const color = PEER_COLORS[peerColorIdx++ % PEER_COLORS.length];
    const group = buildAvatar(color);
    scene.add(group);
    const tag = makeTagSprite(pl.display || pl.account, '#' + color.toString(16).padStart(6, '0'));
    tag.position.y = 2.05;
    group.add(tag);
    const peer = {
      account: pl.account, display: pl.display || pl.account,
      target: pl.p || { x: 0, y: 0, z: 0, yaw: 0 },
      cur: { x: pl.p ? pl.p.x : 0, y: pl.p ? pl.p.y : 0, z: pl.p ? pl.p.z : 0, yaw: 0 },
      group, tag, color, lastSeen: performance.now()
    };
    MP.peers.set(pl.account, peer);
    return peer;
  };

  MP.removePeer = function (account) {
    const p = MP.peers.get(account);
    if (!p) return;
    scene.remove(p.group);
    p.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    MP.peers.delete(account);
  };

  MP.clearPeers = function () {
    for (const acc of [...MP.peers.keys()]) MP.removePeer(acc);
  };

  function refreshTag(peer) {
    if (peer.tag && peer.tag.material && peer.tag.material.map) {
      peer.tag.material.map.dispose();
    }
    const s = makeTagSprite(peer.display, '#' + peer.color.toString(16).padStart(6, '0'));
    peer.tag.material.map = s.material.map;
    peer.tag.material.needsUpdate = true;
  }

  /* ── 远端玩家模型：矮胖雪人熊（跟场景风格一致，不抢戏）── */
  function buildAvatar(colorHex) {
    const g = new THREE.Group();
    const bodyM = new THREE.MeshStandardMaterial({
      color: colorHex, roughness: .78, metalness: .04,
      emissive: new THREE.Color(colorHex).multiplyScalar(.28), emissiveIntensity: .55
    });
    const snowM = new THREE.MeshStandardMaterial({ color: 0xf4f9ff, roughness: .9, metalness: 0 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: .6 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(.42, 18, 14), bodyM);
    body.position.y = .82; body.scale.set(1, .92, .92);
    body.castShadow = true;
    g.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(.30, 16, 12), snowM);
    belly.position.set(0, .78, .22); belly.scale.set(1, 1, .55);
    g.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(.30, 18, 14), bodyM);
    head.position.y = 1.40; head.castShadow = true;
    g.add(head);

    // 耳朵
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(.115, 12, 10), bodyM);
      ear.position.set(s * .21, 1.60, 0);
      g.add(ear);
    }
    // 眼睛
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(.038, 8, 8), darkM);
      e.position.set(s * .10, 1.44, .27);
      g.add(e);
    }
    // 鼻子
    const nose = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 8), darkM);
    nose.position.set(0, 1.35, .29);
    g.add(nose);
    // 围巾
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(.24, .075, 8, 20), new THREE.MeshStandardMaterial({ color: 0xd23b32, roughness: .85 }));
    scarf.position.y = 1.16; scarf.rotation.x = Math.PI / 2;
    g.add(scarf);
    // 脚
    for (const s of [-1, 1]) {
      const ft = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), darkM);
      ft.position.set(s * .17, .16, .05); ft.scale.set(1, .7, 1.3);
      g.add(ft);
    }
    // 手臂
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), bodyM);
      arm.position.set(s * .44, .86, .02); arm.scale.set(1, 1.5, 1);
      g.add(arm);
    }
    g.userData.keep = true;   // 不参与静态合批
    return g;
  }

  /* ══════════════════════════════════════════════════════
     本地第三人称角色
     ══════════════════════════════════════════════════════ */
  MP.startThirdPersonBody = function () {
    if (MP.self) return;
    const g = buildAvatar(0xffd9a0);
    g.visible = false;
    scene.add(g);
    MP.self = g;
  };

  /* ══════════════════════════════════════════════════════
     第三人称相机
     ══════════════════════════════════════════════════════ */
  MP.toggleThird = function () {
    MP.third = !MP.third;
    if (MP.self) MP.self.visible = MP.third;
    if (MP._ui) MP_UI.setThird(MP.third);
    if (MP.third && fp.on) {
      // 从第一人称切到第三人称：先把相机放到角色后方
      const back = new THREE.Vector3(Math.sin(fp.yaw) * MP.camDist, FP_EYE + .35, Math.cos(fp.yaw) * MP.camDist);
      camera.position.set(fp.x + back.x, fp.y + back.y, fp.z + back.z);
    }
    if (window.sfx) sfx.blip(660, .08, .05);
  };

  /* ══════════════════════════════════════════════════════
     每帧更新（插值远端玩家 + 推本地位置 + 第三人称相机）
     ══════════════════════════════════════════════════════ */
  MP.update = function (dt) {
    if (!MP.connected) return;

    /* 远端玩家：位置/朝向插值 */
    const now = performance.now();
    for (const p of MP.peers.values()) {
      const k = 1 - Math.pow(.0016, dt);      // 指数平滑
      const tx = p.target.x, ty = p.target.y, tz = p.target.z;
      p.cur.x += (tx - p.cur.x) * k;
      p.cur.y += (ty - p.cur.y) * k;
      p.cur.z += (tz - p.cur.z) * k;
      // 朝向：走最短弧
      let dy = p.target.yaw - p.cur.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.cur.yaw += dy * k;
      p.group.position.set(p.cur.x, p.cur.y, p.cur.z);
      p.group.rotation.y = p.cur.yaw;
      // 标签始终朝向相机（Sprite 自带）
      // 远距离时淡出标签，避免糊屏
      const d = camera.position.distanceTo(p.group.position);
      p.tag.material.opacity = d > 42 ? 0 : (d > 26 ? (42 - d) / 16 : 1);
    }

    /* 推本地位置 */
    const now2 = performance.now();
    if (now2 - MP.lastSend > 1000 / MP.sendHz) {
      MP.lastSend = now2;
      const px = fp.on ? fp.x : (MP._lastX || 0);
      const py = fp.on ? fp.y : (MP._lastY || 0);
      const pz = fp.on ? fp.z : (MP._lastZ || 0);
      const pyaw = fp.on ? fp.yaw : (MP._lastYaw || 0);
      MP._lastX = px; MP._lastY = py; MP._lastZ = pz; MP._lastYaw = pyaw;
      MP.send({
        t: 'pos', mode: MP.third ? 'tp' : 'fp',
        p: { x: px, y: py, z: pz, yaw: pyaw }
      });
    }

    /* 本地第三人称角色跟随 */
    if (MP.third && fp.on && MP.self) {
      MP.self.position.set(fp.x, fp.y, fp.z);
      MP.self.rotation.y = fp.yaw;
      // 走路时上下轻晃 + 手臂摆动（简化）
      const spd = Math.hypot(fp.vx, fp.vz);
      const bob = spd > .4 ? Math.sin(now2 * .012 * (1 + spd * .3)) * .045 * Math.min(1, spd / 4) : 0;
      MP.self.position.y = fp.y + bob;
      MP.self.children.forEach((c, i) => {
        if (c.geometry && c.geometry.type === 'SphereGeometry' && Math.abs(c.position.x) > .3 && Math.abs(c.position.x) < .5) {
          c.rotation.x = spd > .4 ? Math.sin(now2 * .012 * (1 + spd * .3)) * .5 : 0;
        }
      });

      /* 相机：弹簧跟随角色背后 */
      const yaw = fp.yaw;
      const pitch = Math.max(-.5, Math.min(.6, fp.pitch));
      const dist = MP.camDist;
      const hgt = FP_EYE + .35 + Math.sin(pitch) * dist;
      const back = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch) * dist,
        hgt,
        Math.cos(yaw) * Math.cos(pitch) * dist
      );
      const want = new THREE.Vector3(fp.x, fp.y, fp.z).add(back);
      const kk = 1 - Math.pow(.0009, dt);
      camera.position.lerp(want, kk);
      // 朝向角色胸口偏上
      const look = new THREE.Vector3(fp.x, fp.y + 1.15, fp.z);
      const dir = look.clone().sub(camera.position);
      if (dir.lengthSq() > 1e-6) {
        const targetQ = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(camera.position, look, camera.up)
        );
        camera.quaternion.slerp(targetQ, 1 - Math.pow(.0004, dt));
      }
      camera.position.copy(camera.position);  // 保持
    }
  };

  /* ══════════════════════════════════════════════════════
     HUD：在线玩家列表 + 改 ID + 视角按钮
     ══════════════════════════════════════════════════════ */
  function buildPanel() {
    if (document.getElementById('mp-panel')) return;
    const p = document.createElement('div');
    p.id = 'mp-panel';
    p.innerHTML = `
      <div class="mp-ph">
        <span class="mp-dot"></span>
        <span id="mp-me">未登录</span>
      </div>
      <div class="mp-peers" id="mp-peers"></div>
      <div class="mp-edit">
        <input id="mp-name" type="text" maxlength="16" placeholder="你的ID">
        <button id="mp-save">改</button>
      </div>
      <button id="mp-third" class="mp-btn">第三人称</button>
      <button id="mp-logout" class="mp-btn mp-btn2">退出</button>`;
    document.body.appendChild(p);
    const self = p.querySelector('#mp-me');
    const peers = p.querySelector('#mp-peers');
    const nameI = p.querySelector('#mp-name');
    p.querySelector('#mp-save').onclick = () => {
      const v = nameI.value.trim();
      if (!v) return;
      MP.send({ t: 'name', name: v });
      MP.display = v;
      self.textContent = v + '（' + MP.account + '）';
      nameI.value = '';
    };
    nameI.addEventListener('keydown', e => { if (e.key === 'Enter') p.querySelector('#mp-save').click(); });
    p.querySelector('#mp-third').onclick = () => MP.toggleThird();
    p.querySelector('#mp-logout').onclick = () => {
      try { MP.ws && MP.ws.close(); } catch (e) { }
      MP.ws = null; MP.connected = false; MP.onKicked = null;
      MP.clearPeers();
      showLogin();
    };
    MP._panel = { p, self, peers, nameI, third: p.querySelector('#mp-third') };
  }

  MP.syncPeersUI = function () {
    if (!MP._panel) return;
    const { self, peers } = MP._panel;
    self.textContent = MP.display + '（' + MP.account + '）';
    const list = ['<div class="mp-pr"><b>我</b><span>' + MP.display + '</span></div>'];
    for (const p of MP.peers.values()) {
      list.push('<div class="mp-pr"><b style="color:#' + p.color.toString(16).padStart(6, '0') + '">●</b><span>' + escapeHtml(p.display) + '</span></div>');
    }
    peers.innerHTML = list.join('');
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ══════════════════════════════════════════════════════
     初始化
     ══════════════════════════════════════════════════════ */
  MP.init = function () {
    buildLoginUI();
    buildPanel();
    // 自动登录：查 localStorage
    const saved = localStorage.getItem('xm_mp_acc');
    const savedP = localStorage.getItem('xm_mp_pass');
    if (saved && savedP) {
      MP._ui.acc.value = saved;
      MP._ui.pass.value = savedP;
      setMsg('正在恢复上次登录…');
      MP.connect(saved, savedP);
    }
    // 记住登录信息
    const origLogin = MP.onMsg;
    MP.onMsg = function (m) {
      if (m.t === 'welcome') {
        localStorage.setItem('xm_mp_acc', MP.account);
        localStorage.setItem('xm_mp_pass', MP._pass || '');
      }
      origLogin(m);
    };
  };

  MP.setThird = function (v) {
    if (MP._panel) MP._panel.third.classList.toggle('on', v);
  };

  document.addEventListener('DOMContentLoaded', () => MP.init());
  if (document.readyState !== 'loading') MP.init();

})();
