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
  if (req.url === '/health') {
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
        players: roomPlayers(),
        server: os.hostname(),
        build: currentBuild(),
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
      case 'hand_end': {        // 任何一方松手
        breakPair(session, 'release');
        break;
      }
      case 'ping':
        send({ t: 'pong', ts: Date.now() });
        break;
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

server.listen(PORT, HOST, () => {
  log('多人服务端已启动', HOST + ':' + PORT, '账号:', [...ACCOUNTS.keys()].join(','));
});

process.on('SIGTERM', () => { log('SIGTERM 退出'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT 退出'); process.exit(0); });
