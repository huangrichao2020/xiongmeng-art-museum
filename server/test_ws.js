/* 多人服务端自测：登录 / 同号踢人 / 改名 / 位置同步
   node test_ws.js [host] [port] */
const net = require('net');
const crypto = require('crypto');
const HOST = process.argv[2] || '127.0.0.1';
const PORT = +(process.argv[3] || 18888);

function connect(label) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(PORT, HOST, () => {
      sock.write(
        'GET /ws/ HTTP/1.1\r\n' +
        'Host: ' + HOST + ':' + PORT + '\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\n' +
        'Sec-WebSocket-Version: 13\r\n\r\n'
      );
    });
    let buf = Buffer.alloc(0);
    let handshook = false;
    const msgs = [];
    const waiters = [];
    sock.on('data', c => {
      buf = Buffer.concat([buf, c]);
      if (!handshook) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        const head = buf.slice(0, i).toString();
        buf = buf.slice(i + 4);
        const expect = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        if (!head.includes(expect)) return reject(new Error('accept 校验失败'));
        handshook = true;
        resolve(api);
      }
      // 解析帧（服务端发的都是不掩码单帧）
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.slice(off, off + len).toString('utf8');
        buf = buf.slice(off + len);
        if (op === 0x1) {
          const m = JSON.parse(payload);
          msgs.push(m);
          console.log('  [' + label + ' 收] ' + payload.slice(0, 220));
          const w = waiters.shift();
          if (w) w(m);
        } else if (op === 0x8) { console.log('  [' + label + '] 服务器关闭连接'); }
      }
    });
    sock.on('error', e => {
      // 被踢时服务端会直接断链（ECONNRESET），这是预期行为，不当作致命错
      if (!handshook) return reject(e);
      console.log('  [' + label + ' 连接被关闭: ' + e.code + ']');
    });

    function send(o) {
      const data = Buffer.from(JSON.stringify(o), 'utf8');
      const mask = crypto.randomBytes(4);
      let head;
      if (data.length < 126) { head = Buffer.alloc(2); head[1] = 0x80 | data.length; }
      else if (data.length < 65536) { head = Buffer.alloc(4); head[1] = 0x80 | 126; head.writeUInt16BE(data.length, 2); }
      else { head = Buffer.alloc(10); head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
      head[0] = 0x81;
      const masked = Buffer.from(data);
      for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
      sock.write(Buffer.concat([head, mask, masked]));
    }
    function waitFor(pred, ms = 3000) {
      const found = msgs.find(pred);
      if (found) return Promise.resolve(found);
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
  console.log('=== 1. 客户端A 登录 test01 ===');
  const A = await connect('A');
  A.send({ t: 'login', account: 'test01', pass: '123456' });
  const w1 = await A.waitFor(m => m.t === 'welcome');
  console.log('  welcome =', JSON.stringify(w1));

  console.log('\n=== 2. 客户端B 登录 test02 ===');
  const B = await connect('B');
  B.send({ t: 'login', account: 'test02', pass: '123456' });
  const w2 = await B.waitFor(m => m.t === 'welcome');
  console.log('  welcome.players 人数 =', w2 && w2.players && w2.players.length);

  console.log('\n=== 3. A 应收到 players 列表（含 B）===');
  const pl = await A.waitFor(m => m.t === 'players' && m.players && m.players.length >= 2);
  console.log('  A 看到的玩家 =', pl && JSON.stringify(pl.players));

  console.log('\n=== 4. 同号重复登录：客户端C 用 test01 登录 ===');
  const C = await connect('C');
  C.send({ t: 'login', account: 'test01', pass: '123456' });
  const w3 = await C.waitFor(m => m.t === 'welcome');
  console.log('  C welcome =', JSON.stringify(w3 && w3.you));
  await sleep(600);
  const kicked = await A.waitFor(m => m.t === 'kicked', 2000);
  console.log('  A 收到 kicked =', JSON.stringify(kicked));

  console.log('\n=== 5. 错误密码 ===');
  const D = await connect('D');
  D.send({ t: 'login', account: 'test01', pass: 'wrong' });
  const err = await D.waitFor(m => m.t === 'err', 2000);
  console.log('  D 收到 err =', JSON.stringify(err));

  console.log('\n=== 6. 改名 + 位置同步 ===');
  C.send({ t: 'name', name: '熊萌一号' });
  await sleep(300);
  B.send({ t: 'pos', p: { x: 1.5, y: 0.2, z: -3.25, yaw: 1.2 }, mode: 'tp' });
  await sleep(500);
  // move 是广播给别人的，所以发位置的人自己收不到，队友 C 才收到
  const mv = await C.waitFor(m => m.t === 'move');
  console.log('  C 收到队友 B 的 move =', JSON.stringify(mv));

  console.log('\n=== 结果 ===');
  const ok = w1 && w2 && w3 && kicked && err && mv;
  console.log(ok ? '全部通过 ✅' : '有失败 ❌');
  [A, B, C, D].forEach(c => { try { c.close(); } catch (e) { } });
  process.exit(ok ? 0 : 1);
})();
