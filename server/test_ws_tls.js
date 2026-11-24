/* 端到端：走 wss://preview.ai10088.com/alex-garage/ws/ */
const tls=require('tls'),crypto=require('crypto');
const HOST='preview.ai10088.com',PORT=443,PATH='/alex-garage/ws/';
function connect(label){
  return new Promise((resolve,reject)=>{
    const key=crypto.randomBytes(16).toString('base64');
    const sock=tls.connect({host:HOST,port:PORT,servername:HOST},()=>{
      sock.write(`GET ${PATH} HTTP/1.1\r\nHost: ${HOST}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf=Buffer.alloc(0),hs=false;const msgs=[],waiters=[];
    sock.on('data',c=>{
      buf=Buffer.concat([buf,c]);
      if(!hs){const i=buf.indexOf('\r\n\r\n');if(i<0)return;
        const head=buf.slice(0,i).toString();buf=buf.slice(i+4);
        if(!/101/.test(head))return reject(new Error('握手失败: '+head.split('\r\n')[0]));
        hs=true;resolve(api);}
      while(buf.length>=2){const op=buf[0]&0x0f;let len=buf[1]&0x7f,off=2;
        if(len===126){if(buf.length<4)return;len=buf.readUInt16BE(2);off=4;}
        else if(len===127){if(buf.length<10)return;len=Number(buf.readBigUInt64BE(2));off=10;}
        if(buf.length<off+len)return;
        const pl=buf.slice(off,off+len).toString('utf8');buf=buf.slice(off+len);
        if(op===0x1){const m=JSON.parse(pl);msgs.push(m);console.log(`  [${label}] ← ${pl.slice(0,180)}`);
          const w=waiters.shift();if(w)w(m);}}
    });
    sock.on('error',e=>{if(!hs)reject(e);else console.log(`  [${label}] 断开 ${e.code}`);});
    function send(o){const d=Buffer.from(JSON.stringify(o),'utf8');const mask=crypto.randomBytes(4);
      let h;if(d.length<126){h=Buffer.alloc(2);h[1]=0x80|d.length;}
      else if(d.length<65536){h=Buffer.alloc(4);h[1]=0x80|126;h.writeUInt16BE(d.length,2);}
      else{h=Buffer.alloc(10);h[1]=0x80|127;h.writeBigUInt64BE(BigInt(d.length),2);}
      h[0]=0x81;const m=Buffer.from(d);for(let i=0;i<m.length;i++)m[i]^=mask[i&3];
      sock.write(Buffer.concat([h,mask,m]));}
    function waitFor(pred,ms=4000){const f=msgs.find(pred);if(f)return Promise.resolve(f);
      return new Promise(r=>{const t=setTimeout(()=>r(null),ms);waiters.push(m=>{if(pred(m)){clearTimeout(t);r(m);}});});}
    const api={send,waitFor,msgs,close:()=>sock.destroy()};
  });
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  console.log('=== 端到端 wss 测试 ===');
  const A=await connect('A');A.send({t:'login',account:'test01',pass:'123456'});
  const w1=await A.waitFor(m=>m.t==='welcome');
  console.log('  A 登录:',w1&&w1.you.display);
  const B=await connect('B');B.send({t:'login',account:'test02',pass:'123456'});
  const w2=await B.waitFor(m=>m.t==='welcome');
  console.log('  B 登录:',w2&&w2.you.display,'看到',w2&&w2.players.length,'人');
  await sleep(400);
  const C=await connect('C');C.send({t:'login',account:'test01',pass:'123456'});
  await sleep(800);
  const kicked=await A.waitFor(m=>m.t==='kicked',2500);
  console.log('  A 被踢:',kicked&&kicked.msg);
  C.send({t:'name',name:'熊萌小一'});
  B.send({t:'pos',p:{x:2,y:0,z:-8,yaw:.5},mode:'tp'});
  await sleep(700);
  const mv=await C.waitFor(m=>m.t==='move');
  console.log('  C 收到 B 的位置:',mv&&JSON.stringify(mv.p));
  const ok=w1&&w2&&kicked&&mv;
  console.log(ok?'\n端到端全部通过 ✅':'\n有失败 ❌');
  [A,B,C].forEach(c=>{try{c.close();}catch(e){}});
  process.exit(ok?0:1);
})();
