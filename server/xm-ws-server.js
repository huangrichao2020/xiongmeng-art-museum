#!/usr/bin/env node
/* 熊萌艺术馆 · 多人联机服务端
   零依赖：自己实现 RFC6455 WebSocket 握手 + 帧解析
   ── 功能 ──
   · 账号登录（默认 test01 / test02，密码 123456），密码明文存内存（纯测试用）
   · 同一账号重复登录 → 踢掉上一个连接
   · 每个账号可修改显示 ID（进入后可编辑）
   · 广播玩家位置/朝向/ID；房内玩家列表
   · 心跳 ping/pong，断线清理
   监听 127.0.0.1:18888，由 nginx 反代到 wss://preview.ai10088.com/alex-garage/ws/
*/
'use strict';
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PORT = 18888;
const HOST = '127.0.0.1';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/* ══════════════════════════════════════════════════════════════════════
   全局时间基准
   ──────────────────────────────────────────────────────────────────────
   多人世界里所有「表演性」的循环动画（旋转木马、马戏团四幕、热气球浮动、
   灯串扫光）以前各客户端各转各的：每个页面用自己的 t += dt 累加，
   起点是页面加载那一刻，累加速率还受各自帧率影响 —— 于是同一部
   旋转木马，在甲的手机上转了两圈，在乙的手机上才转了一圈半。

   解决办法：时间是唯一的，动画相位只能是时间的纯函数。
     · TIME_EPOCH = 全端约定的固定纪元（不用服务器启动时刻，
       否则服务器一重启所有人的画面相位就整体跳一次）
     · 客户端拿服务器时间做偏移校准（NTP 方式：ping 带 c1，
       服务端回 s2/s3，客户端算 ((s2-c1)+(s3-t4))/2）
     · 客户端的 t = (服务器时间 - TIME_EPOCH)/1000，直接算，不累加
   这样只要两端时钟对齐，同一时刻看到的就是同一帧。
   ══════════════════════════════════════════════════════════════════════ */
const TIME_EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);   // 固定纪元，全端一致
const startedAt = Date.now();                       // 服务端本次启动时刻（仅用于展示/诊断）

/* ── 账号表 ──
   test01 / test02 是给真人玩家用的（游戏登录页的快捷按钮就是这两个）；
   test03~test08 是自动化探针专用的 —— 探针按进程号分配账号，
   免得探针跟真人抢同一个号、把人家顶下线。 */
const ACCOUNTS = new Map([
  ['test01', { pass: '123456' }],
  ['test02', { pass: '123456' }],
  ['test03', { pass: '123456' }],
  ['test04', { pass: '123456' }],
  ['test05', { pass: '123456' }],
  ['test06', { pass: '123456' }],
  ['test07', { pass: '123456' }],
  ['test08', { pass: '123456' }],
]);

/* ── 最近一次「踢人」的时间戳 ──
   同账号被踢后 3 秒内的再次登录直接拒绝：
   被踢的一方如果没收到 kicked 消息（连接已半开），它会自动重连，
   重连又会顶掉刚登录的新客户端 → 两边无限互踢。
   这个护栏让「被踢方的自动重连」撞墙停下，循环自然终止。 */
const kickGuard = new Map();
const KICK_GUARD_MS = 3000;

/* ── 显示 ID 存档 ──
   改过的 ID 必须记住：落盘到 names.json，服务重启也不丢。
   （之前 ID 只存在内存里，而且登录时前端根本不带 ID，
     所以每次进去改的名字一刷新就没了）*/
const NAME_FILE = path.join(__dirname, 'names.json');
const displayNames = new Map();
function loadNames() {
  try {
    const raw = JSON.parse(fs.readFileSync(NAME_FILE, 'utf8'));
    for (const k of Object.keys(raw)) {
      if (typeof raw[k] === 'string' && raw[k]) displayNames.set(k, raw[k]);
    }
    log('已载入显示 ID 存档：' + displayNames.size + ' 条');
  } catch (e) { /* 没有存档文件是正常的 */ }
}
function saveNames() {
  try {
    const obj = {};
    for (const [k, v] of displayNames) obj[k] = v;
    fs.writeFileSync(NAME_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { log('写 ID 存档失败：' + e.message); }
}

/* ── 雪币钱包存档 ──
   每个账号一份 {coin, earned, spent}，落盘 wallets.json。
   （之前雪币只活在前端内存里，一刷新就归零 —— 玩家攒的钱全没了）*/
const WALLET_FILE = path.join(__dirname, 'wallets.json');
const wallets = new Map();
const WALLET_START_COIN = 60;          // 新账号启动资金，跟前端默认值一致
function loadWallets() {
  try {
    const raw = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    for (const k of Object.keys(raw)) {
      const w = raw[k] || {};
      wallets.set(k, {
        coin: Math.max(0, Math.floor(+w.coin || 0)),
        earned: Math.max(0, Math.floor(+w.earned || 0)),
        spent: Math.max(0, Math.floor(+w.spent || 0)),
      });
    }
    log('已载入钱包存档：' + wallets.size + ' 条');
  } catch (e) { /* 没有存档文件是正常的 */ }
}
function saveWallets() {
  try {
    const obj = {};
    for (const [k, v] of wallets) obj[k] = v;
    fs.writeFileSync(WALLET_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { log('写钱包存档失败：' + e.message); }
}
function walletOf(acc) {
  if (!wallets.has(acc)) wallets.set(acc, { coin: WALLET_START_COIN, earned: 0, spent: 0 });
  return wallets.get(acc);
}

/* ── 半开连接的判定阈值 ──
   12 秒内没有任何数据往来 = 这条连接已经死了（弱网/手机息屏/切网） */
const IDLE_ALIVE_MS = 12000;
const IDLE_DEAD_MS = 60000;

/* ── 当前线上版本的构建标记 ──
   客户端登录时把这个标记跟它自己页面里的 <meta name="xm-build"> 比对：
   不一致 = 那个标签页打开的是部署之前的旧页面（功能会缺，提示也不会弹）。
   从 index.html 里现读，按 mtime 缓存，不用重启服务也能跟上新的部署。 */
const INDEX_FILE = '/www/wwwroot/jiaojia-preview/alex-garage/index.html';
let buildCache = { mtime: 0, tag: '' };
function currentBuild() {
  try {
    const st = fs.statSync(INDEX_FILE);
    if (st.mtimeMs !== buildCache.mtime) {
      const html = fs.readFileSync(INDEX_FILE, 'utf8');
      const m = html.match(/name="xm-build"\s+content="([^"]+)"/);
      buildCache = { mtime: st.mtimeMs, tag: m ? m[1] : '' };
    }
    return buildCache.tag;
  } catch (e) { return ''; }
}

/* ── 全部连接（含还没登录的） ── */
const allSockets = new Set();

/* ══════════════════════════════════════════════════════════════════════
   新版本广播
   ──────────────────────────────────────────────────────────────────────
   线上发布很频繁，但一个标签页可能开了一整天。旧做法是「登录时比对一次
   构建标记」，于是：没登录的人收不到、WS 断着的人收不到、已经登录挂着不动
   的人也收不到 —— 只能靠人肉发现「怎么没反应」。
   现在三条路都通：
     ① 服务端每 5 秒看一眼 index.html 的 mtime，变了就**主动推**给所有在线连接；
     ② 部署脚本上传完立刻 curl /notify-update，推送是即时的；
     ③ 客户端自己每 30 秒轮询一次 /build（WS 没连上也能收到）。
   客户端拿到新标记后，右上角弹一个小按钮，点一下强制拉新页面重载。
   ══════════════════════════════════════════════════════════════════════ */
let lastBuild = currentBuild();
function broadcastAll(obj){
  const txt = JSON.stringify(obj);
  for(const sock of allSockets){
    if(sock.destroyed) continue;
    try{ sock.write(encodeFrame(txt)); }catch(e){ }
  }
}
/* 检测到线上文件变了就广播；返回 true 表示确实换版本了 */
function checkBuildChange(){
  const b = currentBuild();
  if(!b || b === lastBuild) return false;
  lastBuild = b;
  broadcastAll({t:'update', build:b, changed:true, ts:Date.now()});
  log('update', '检测到新版本并已广播', b);
  return true;
}
setInterval(()=>{ try{ checkBuildChange(); }catch(e){ } }, 5000);

/* ── 在线会话：account → session ── */
const sessions = new Map();      // account -> session
const bySocket = new Map();      // socket -> session
let seq = 0;

/* ══════════════════════════════════════════════════════
   WebSocket 帧实现
   ══════════════════════════════════════════════════════ */
const OP = { CONT: 0x0, TEXT: 0x1, BIN: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xA };

function makeAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

function encodeFrame(payload, opcode = OP.TEXT) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const len = data.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeUInt32BE(0, 2);
    head.writeUInt32BE(len, 6);
  }
  head[0] = 0x80 | opcode;   // FIN + opcode
  return Buffer.concat([head, data]);
}

/* 解析器：累积缓冲，逐帧吐 payload */
class FrameParser {
  constructor(onMessage, onClose, onPing) {
    this.buf = Buffer.alloc(0);
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.onPing = onPing;
  }
  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (true) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < off + 2) return;
        len = this.buf.readUInt16BE(off); off += 2;
      } else if (len === 127) {
        if (this.buf.length < off + 8) return;
        const hi = this.buf.readUInt32BE(off);
        const lo = this.buf.readUInt32BE(off + 4);
        len = hi * 4294967296 + lo; off += 8;
      }
      let mask = null;
      if (masked) {
        if (this.buf.length < off + 4) return;
        mask = this.buf.slice(off, off + 4); off += 4;
      }
      if (this.buf.length < off + len) return;
      let payload = this.buf.slice(off, off + len);
      if (mask) {
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buf = this.buf.slice(off + len);

      if (opcode === OP.CLOSE) { this.onClose(); return; }
      if (opcode === OP.PING) { this.onPing(payload); continue; }
      if (opcode === OP.PONG) continue;
      if (opcode === OP.CONT) continue;   // 本项目不做分片
      if (opcode === OP.TEXT || opcode === OP.BIN) {
        this.onMessage(payload.toString('utf8'), opcode === OP.TEXT);
      }
    }
  }
}

/* ══════════════════════════════════════════════════════
   HTTP → WebSocket 升级
   ══════════════════════════════════════════════════════ */
const server = http.createServer((req, res) => {
  const path = String(req.url || '').split('?')[0];
  /* 当前线上构建标记（客户端兜底轮询用；nginx 把 /alex-garage/ws/build 代理到这里，
     所以路径可能带前缀，用 endsWith 匹配） */
  if (path.endsWith('/build')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ build: currentBuild(), ts: Date.now() }));
    return;
  }
  /* 服务器权威时间：页面一加载就能拿到（不需要先登录），
     客户端据此校准自己的时钟偏移，之后所有循环动画都用服务器时间算相位。 */
  if (path.endsWith('/time')) {
    const now = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ epoch: TIME_EPOCH, st: startedAt, now: now }));
    return;
  }
  /* 部署脚本上传完立刻调它：新版本马上推给所有在线设备，不用等 5 秒轮询 */
  if (path.endsWith('/notify-update')) {
    const b = currentBuild();
    if (b) broadcastAll({ t: 'update', build: b, changed: true, ts: Date.now() });
    log('update', '手动广播当前版本', b);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, build: b, ts: Date.now() }));
    return;
  }
  /* nginx 代理过来时路径带 /alex-garage/ws 前缀，所以用 endsWith 匹配 */
  if (path.endsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      online: sessions.size,
      accounts: [...sessions.keys()],
      uptime: Math.round(process.uptime())
    }));
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const ver = req.headers['sec-websocket-version'];
  if (!key || String(ver) !== '13') {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + makeAccept(key) + '\r\n\r\n'
  );
  socket.setNoDelay(true);
  handleConn(socket);
});

/* ══════════════════════════════════════════════════════
   连接处理
   ══════════════════════════════════════════════════════ */
function handleConn(socket) {
  let session = null;
  allSockets.add(socket);

  function send(obj) {
    if (socket.destroyed) return;
    try { socket.write(encodeFrame(JSON.stringify(obj))); } catch (e) { /* 断开 */ }
  }

  function close(code = 1000, reason = '') {
    try {
      socket.write(encodeFrame(Buffer.alloc(0), OP.CLOSE));
      socket.end();
    } catch (e) { /* ignore */ }
  }

  const parser = new FrameParser(
    (text) => {
      let msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      onMessage(msg);
    },
    () => {
      /* 客户端先发关闭 → 必须回一个 CLOSE 帧把关闭握手走完。
         以前服务端收到 CLOSE 直接清理不回复，浏览器就永远停在 CLOSING，
         onclose 不触发，前端也不会重连 —— 这正是「掉线后再也连不上」的元凶。 */
      try { socket.write(encodeFrame(Buffer.alloc(0), OP.CLOSE)); } catch (e) { }
      try { socket.end(); } catch (e) { }
      cleanup();
    },
    (payload) => {
      if (!socket.destroyed) socket.write(encodeFrame(payload, OP.PONG));
    }
  );

  socket.on('data', c => {
    /* 任何数据都算「还活着」—— 客户端 15Hz 推位置，正常时每秒都有 */
    if (session) session.lastSeen = Date.now();
    try { parser.push(c); } catch (e) { cleanup(); }
  });
  socket.on('error', () => cleanup());
  socket.on('close', () => cleanup());

  function cleanup() {
    allSockets.delete(socket);
    if (!session) { try { socket.destroy(); } catch (e) { } return; }
    const s = session; session = null;
    if (sessions.get(s.account) === s) sessions.delete(s.account);
    bySocket.delete(socket);
    breakPair(s, 'offline');
    broadcastRoom(s.room);
    const idle = Math.round((Date.now() - (s.lastSeen || Date.now())) / 1000);
    const dur = Math.round((Date.now() - s.joinedAt) / 1000);
    log('offline', s.account, '在线' + dur + 's', '静默' + idle + 's', 'online=' + sessions.size);
  }

  /* ── 牵手：解掉配对 / 撤掉挂起的请求 ──
     任何一方掉线或松手，另一边必须马上收到 hand_end，
     否则会出现「客户端以为还牵着、实际对方已经走了」的鬼状态。 */
  function breakPair(s, why) {
    if (!s) return;
    /* 挂起的请求：对方等不到回应，直接判成拒绝 */
    if (s.handReq) {
      const other = sessions.get(s.handReq.to);
      if (other) {
        other.handReq = null;
        other.send({ t: 'hand_rej', from: s.account, display: s.display });
      }
      s.handReq = null;
    }
    if (!s.hand) return;
    const pid = s.hand;
    s.hand = null;
    const partner = sessions.get(pid);
    if (partner) {
      partner.hand = null;
      broadcastRoom(s.room, { t: 'hand_end', a: s.account, b: pid });
    }
    log('hand-end', s.account, 'x', pid, why || '');
  }

  function onMessage(msg) {
    const t = msg.t;
    /* 记录「收到这条消息的时刻」，ping 回包时作为 NTP 的 s2 用 */
    try { msg.__s2 = Date.now(); } catch (e) { }
    if (t === 'login') {
      const acc = String(msg.account || '').trim().toLowerCase();
      const pass = String(msg.pass || '');
      const rec = ACCOUNTS.get(acc);
      if (!rec) { send({ t: 'err', code: 'noaccount', msg: '账号不存在' }); close(4004); return; }
      if (rec.pass !== pass) { send({ t: 'err', code: 'badpass', msg: '密码错误' }); close(4003); return; }

      // 刚被踢过的账号，短时间内不再放行登录（防互踢死循环）
      const kickedAt = kickGuard.get(acc);
      if (kickedAt && Date.now() - kickedAt < KICK_GUARD_MS) {
        send({ t: 'err', code: 'retry', msg: '该账号刚在别处登录，稍后重试' });
        close(4009);
        log('guard-block', acc);
        return;
      }

      // 同号重复登录 → 踢掉上一个
      const old = sessions.get(acc);
      if (old && old !== session) {
        /* 只有老连接「还活着」（12 秒内有数据）才算真被顶号。
           弱网/息屏留下的僵尸连接不算 —— 否则自己的连接半开时重连，
           老僵尸被踢 + 触发 3 秒护栏，反而把自己挡在门外（这正是
           「在线不到一分钟就掉线、还再也连不上」的原因） */
        const oldIdle = Date.now() - (old.lastSeen || 0);
        if (oldIdle < IDLE_ALIVE_MS) {
          // 先把「被踢」消息写出去，再延迟断开 —— 立刻 end() 会让客户端
          // 只看到断线、收不到 kicked，提示就变成「连接断开」而不是「别处登录」
          try { old.socket.write(encodeFrame(JSON.stringify({ t: 'kicked', msg: '该账号在别处登录' }))); } catch (e) { }
          setTimeout(() => { try { old.socket.end(); } catch (e) { } }, 120);
          kickGuard.set(acc, Date.now());
          log('kick-old', acc);
        } else {
          log('replace-stale', acc, '静默' + Math.round(oldIdle / 1000) + 's');
        }
        if (sessions.get(acc) === old) sessions.delete(acc);
        bySocket.delete(old.socket);
      }

      /* 显示 ID：前端带上来的优先；没带就用存档里的；都没有就用账号名 */
      const wantName = String(msg.name || '').trim().slice(0, 16);
      if (wantName && wantName !== acc) {
        displayNames.set(acc, wantName);
        saveNames();
      }
      const disp = wantName || displayNames.get(acc) || acc;

      session = {
        id: ++seq,
        account: acc,
        display: disp,
        room: 'main',
        socket, send,
        pos: { x: 0, y: 0, z: 0, yaw: 0 },
        /* 牵手：hand=对方账号（已配对）；handReq=待处理的请求 {to,from} */
        hand: null,
        handReq: null,
        alive: true,
        lastSeen: Date.now(),
        joinedAt: Date.now(),
      };
      sessions.set(acc, session);
      bySocket.set(socket, session);

      send({
        t: 'welcome',
        you: { account: acc, display: session.display },
        wallet: walletOf(acc),
        players: roomPlayers(),
        server: os.hostname(),
        build: currentBuild(),
        epoch: TIME_EPOCH,
        st: startedAt,
        now: Date.now(),
      });
      broadcastRoom(session.room);
      log('online', acc, 'online=' + sessions.size);
      return;
    }

    if (!session) return;

    switch (t) {
      case 'name': {           // 改显示 ID
        const d = String(msg.name || '').trim().slice(0, 16);
        if (!d) break;
        session.display = d;
        displayNames.set(session.account, d);
        saveNames();
        broadcastRoom(session.room, { t: 'rename', account: session.account, display: d });
        log('rename', session.account, '->', d);
        break;
      }
      case 'pos': {            // 位置同步
        const p = msg.p || {};
        session.pos = {
          x: +(+p.x).toFixed(3), y: +(+p.y).toFixed(3), z: +(+p.z).toFixed(3),
          yaw: +(+p.yaw).toFixed(3),
          jy: +(+p.jy || 0).toFixed(3),      // 离地高度（跳跃）—— 少了它对方看不到跳跃动作
        };
        broadcastRoom(session.room, {
          t: 'move', account: session.account, display: session.display,
          p: session.pos, mode: msg.mode || 'fp'
        }, session);
        break;
      }
      case 'hand_req': {        // A 向 B 发起牵手
        const to = String(msg.to || '').trim().toLowerCase();
        const target = sessions.get(to);
        if (!target || target === session) break;
        if (session.hand || target.hand) {
          send({ t: 'err', code: 'handbusy', msg: '你或对方已经在牵别人了' });
          break;
        }
        if (target.handReq) {
          send({ t: 'err', code: 'handbusy', msg: '对方正忙着处理另一个牵手请求' });
          break;
        }
        session.handReq = { to, from: session.account };
        target.handReq = { to: session.account, from: session.account };
        target.send({ t: 'hand_in', from: session.account, display: session.display });
        send({ t: 'hand_wait', to, display: target.display });
        log('hand-req', session.account, '->', to);
        break;
      }
      case 'hand_res': {        // B 回应 A 的牵手请求
        const to = String(msg.to || '').trim().toLowerCase();
        const req = session.handReq;
        const other = sessions.get(to);
        if (!req || !other || req.to !== to) break;
        session.handReq = null;
        other.handReq = null;
        if (msg.accept) {
          const a = to, b = session.account;      // a=发起方=领队，b=回应方=跟随者
          const sa = sessions.get(a), sb = sessions.get(b);
          if (!sa || !sb) break;
          sa.hand = b; sb.hand = a;
          broadcastRoom(session.room, {
            t: 'hand_pair', a, b, aDisplay: sa.display, bDisplay: sb.display
          });
          log('hand-pair', a, '<->', b);
        } else {
          other.send({ t: 'hand_rej', from: session.account, display: session.display });
          log('hand-rej', to, 'x', session.account);
        }
        break;
      }
      case 'hand_cancel': {     // 发起方取消请求
        const to = String(msg.to || '').trim().toLowerCase();
        const other = sessions.get(to);
        if (other) {
          other.handReq = null;
          other.send({ t: 'hand_cancel', from: session.account });
        }
        session.handReq = null;
        log('hand-cancel', session.account, '->', to);
        break;
      }
      case 'hand_end': {        // 任何一方松手
        breakPair(session, 'release');
        break;
      }
      case 'ping':
        /* NTP 风格时间同步：客户端带 c1（自己发出的时刻），
           服务端回 s2（收到的时刻）和 s3（发出的时刻），
           客户端算 offset = ((s2-c1)+(s3-t4))/2 —— 这是消除
           「每个人手机上的动画轨迹对不上」的关键。 */
        send({ t: 'pong', ts: Date.now(), c1: msg.c1, s2: msg.__s2 || Date.now(), s3: Date.now(), epoch: TIME_EPOCH, st: startedAt });
        break;
      case 'wallet': {         // 客户端上报雪币余额，落盘保存
        const w = walletOf(session.account);
        const c = Math.max(0, Math.floor(+msg.coin || 0));
        const e = Math.max(0, Math.floor(+msg.earned || 0));
        const sp = Math.max(0, Math.floor(+msg.spent || 0));
        if (w.coin !== c || w.earned !== e || w.spent !== sp) {
          w.coin = c; w.earned = e; w.spent = sp;
          saveWallets();
        }
        send({ t: 'wallet_ok', coin: w.coin, earned: w.earned, spent: w.spent });
        break;
      }
      case 'chat': {
        const txt = String(msg.text || '').slice(0, 120);
        if (!txt) break;
        broadcastRoom(session.room, { t: 'chat', account: session.account, display: session.display, text: txt });
        break;
      }
    }
  }
}

/* ── 房间广播 ── */
function roomPlayers() {
  return [...sessions.values()].map(s => ({
    account: s.account, display: s.display, p: s.pos, mode: s.mode || 'fp'
  }));
}

function broadcastRoom(room, msg, except) {
  const payload = msg || { t: 'players', players: roomPlayers() };
  for (const s of sessions.values()) {
    if (s.room !== room) continue;
    if (except && s === except) continue;
    s.send(payload);
  }
}

function log(...a) {
  console.log('[' + new Date().toISOString().slice(11, 19) + ']', ...a);
}

/* 心跳：每 20 秒 ping 一次（浏览器会自动回 pong） */
setInterval(() => {
  for (const s of sessions.values()) {
    try { s.socket.write(encodeFrame(Buffer.alloc(0), OP.PING)); } catch (e) { }
  }
}, 20000).unref?.();

/* 半开连接清理：60 秒没有任何数据往来 → 认定连接已死，主动断开。
   不清的话，僵尸连接会一直占着账号，别人登录时反而被当成「同号顶号」踢掉。 */
setInterval(() => {
  const now = Date.now();
  for (const s of [...sessions.values()]) {
    const idle = now - (s.lastSeen || now);
    if (idle > IDLE_DEAD_MS) {
      log('timeout', s.account, '静默' + Math.round(idle / 1000) + 's');
      try { s.socket.destroy(); } catch (e) { }
    }
  }
}, 10000).unref?.();

loadNames();
loadWallets();

server.listen(PORT, HOST, () => {
  log('多人服务端已启动', HOST + ':' + PORT, '账号:', [...ACCOUNTS.keys()].join(','));
});

process.on('SIGTERM', () => { log('SIGTERM 退出'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT 退出'); process.exit(0); });
