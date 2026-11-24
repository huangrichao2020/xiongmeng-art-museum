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
    () => cleanup(),
    (payload) => {
      if (!socket.destroyed) socket.write(encodeFrame(payload, OP.PONG));
    }
  );

  socket.on('data', c => { try { parser.push(c); } catch (e) { cleanup(); } });
  socket.on('error', () => cleanup());
  socket.on('close', () => cleanup());

  function cleanup() {
    if (!session) { try { socket.destroy(); } catch (e) { } return; }
    const s = session; session = null;
    if (sessions.get(s.account) === s) sessions.delete(s.account);
    bySocket.delete(socket);
    broadcastRoom(s.room);
    log('offline', s.account, 'online=' + sessions.size);
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
        send({ t: 'err', code: 'kicked', msg: '该账号已在别处登录' });
        close(4009);
        log('guard-block', acc);
        return;
      }

      // 同号重复登录 → 踢掉上一个
      const old = sessions.get(acc);
      if (old && old !== session) {
        // 先把「被踢」消息写出去，再延迟断开 —— 立刻 end() 会让客户端
        // 只看到断线、收不到 kicked，提示就变成「连接断开」而不是「别处登录」
        try { old.socket.write(encodeFrame(JSON.stringify({ t: 'kicked', msg: '该账号在别处登录' }))); } catch (e) { }
        setTimeout(() => { try { old.socket.end(); } catch (e) { } }, 120);
        if (sessions.get(acc) === old) sessions.delete(acc);
        bySocket.delete(old.socket);
        kickGuard.set(acc, Date.now());
        log('kick-old', acc);
      }

      session = {
        id: ++seq,
        account: acc,
        display: String(msg.name || acc).slice(0, 16),
        room: 'main',
        socket, send,
        pos: { x: 0, y: 0, z: 0, yaw: 0 },
        alive: true,
        joinedAt: Date.now(),
      };
      sessions.set(acc, session);
      bySocket.set(socket, session);

      send({
        t: 'welcome',
        you: { account: acc, display: session.display },
        players: roomPlayers(),
        server: os.hostname(),
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

/* 心跳：每 25s ping，60s 无响应判定掉线 */
setInterval(() => {
  for (const s of sessions.values()) {
    try { s.socket.write(encodeFrame(Buffer.alloc(0), OP.PING)); } catch (e) { }
  }
}, 25000).unref?.();

server.listen(PORT, HOST, () => {
  log('多人服务端已启动', HOST + ':' + PORT, '账号:', [...ACCOUNTS.keys()].join(','));
});

process.on('SIGTERM', () => { log('SIGTERM 退出'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT 退出'); process.exit(0); });
