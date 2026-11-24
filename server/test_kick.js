/* 同号顶号护栏自测：
   1) A 登录 test05 → 收到 welcome
   2) B 用同号登录 → A 收到 kicked（被顶号）
   3) A 立刻重连（模拟前端没收到 kicked 时的自动重连）→ 应被护栏拒绝（err code=kicked）
   4) 拒绝后连接关闭，不应再收到 welcome —— 互踢死循环就此终止
   node test_kick.js [host] [port] */
const net = require('net');
const crypto = require('crypto');
const HOST = process.argv[2] || '127.0.0.1';
const PORT = +(process.argv[3] || 18888);
const ACC = process.argv[4] || 'test05';

function connect(label) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(PORT, HOST, () => {
      sock.write('GET /ws/ HTTP/1.1\r\nHost: ' + HOST + ':' + PORT + '\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    let buf = Buffer.alloc(0), hs = false;
    const msgs = [], waiters = [];
    sock.on('data', c => {
      buf = Buffer.concat([buf, c]);
      if (!hs) {
        const i = buf.indexOf('\r\n\r\n'); if (i < 0) return;
        buf = buf.slice(i + 4); hs = true; resolve(api);
      }
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f; let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.slice(off, off + len).toString('utf8');
        buf = buf.slice(off + len);
        if (op === 0x1) {
          const m = JSON.parse(payload); msgs.push(m);
          console.log('  [' + label + ' 收] ' + payload.slice(0, 160));
          const w = waiters.shift(); if (w) w(m);
        } else if (op === 0x8) { console.log('  [' + label + '] 服务端关闭连接'); }
      }
    });
    sock.on('error', e => { if (!hs) return reject(e); console.log('  [' + label + ' 连接断开: ' + e.code + ']'); });
    function send(o) {
      const data = Buffer.from(JSON.stringify(o), 'utf8');
      const mask = crypto.randomBytes(4); let head;
      if (data.length < 126) { head = Buffer.alloc(2); head[1] = 0x80 | data.length; }
      else { head = Buffer.alloc(4); head[1] = 0x80 | 126; head.writeUInt16BE(data.length, 2); }
      head[0] = 0x81;
      const masked = Buffer.from(data);
      for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
      sock.write(Buffer.concat([head, mask, masked]));
    }
    function waitFor(pred, ms = 4000) {
      const f = msgs.find(pred); if (f) return Promise.resolve(f);
      return new Promise(res => {
        const t = setTimeout(() => res(null), ms);
        waiters.push(m => { if (pred(m)) { clearTimeout(t); res(m); } });
      });
    }
    const api = { sock, send, waitFor, msgs, close: () => sock.destroy() };
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let fail = 0;
  const ok = (cond, name, extra) => {
    console.log((cond ? '  ✔ ' : '  ✘ ') + name + (extra ? '  ' + extra : ''));
    if (!cond) fail++;
  };

  console.log('① A 登录 ' + ACC);
  const A = await connect('A');
  A.send({ t: 'login', account: ACC, pass: '123456' });
  const w1 = await A.waitFor(m => m.t === 'welcome');
  ok(!!w1, 'A 收到 welcome');

  console.log('② B 用同号登录 → A 应被踢');
  const B = await connect('B');
  B.send({ t: 'login', account: ACC, pass: '123456' });
  const w2 = await B.waitFor(m => m.t === 'welcome');
  ok(!!w2, 'B 收到 welcome（新登录顶掉旧登录）');
  const k = await A.waitFor(m => m.t === 'kicked');
  ok(!!k, 'A 收到 kicked 消息');

  console.log('③ A 立刻重连（模拟没收到 kicked 的自动重连）');
  const A2 = await connect('A2');
  A2.send({ t: 'login', account: ACC, pass: '123456' });
  const e = await A2.waitFor(m => m.t === 'err' || m.t === 'welcome');
  ok(!!e && e.t === 'err' && e.code === 'kicked',
     'A2 被护栏拒绝（err/kicked），不再顶掉 B', e ? JSON.stringify(e) : '无响应');

  console.log('④ B 仍在线，不受影响');
  B.send({ t: 'pos', mode: 'fp', p: { x: 1, y: 2, z: 3, yaw: 0, jy: 0.5 } });
  await sleep(400);
  ok(B.msgs.length > 0 && B.msgs[B.msgs.length - 1].t !== 'err', 'B 连接正常，未被连带踢掉');

  A.close(); A2.close(); B.close();
  console.log(fail ? ('\n结果：' + fail + ' 项失败') : '\n结果：全部通过');
  process.exit(fail ? 1 : 0);
})();
