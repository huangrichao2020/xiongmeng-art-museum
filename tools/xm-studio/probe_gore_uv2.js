const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1000,height:700}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.__PROBE && window.__PROBE.balloons, { timeout:120000 });
  await p.waitForTimeout(7000);
  const info = await p.evaluate(() => {
    const P = window.__PROBE, T = window.__THREE;
    const bb = P.balloons[0];
    const list = [];
    let gores = 0;
    bb.g.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material;
      list.push({ uuid: m.uuid, hasMap: !!m.map, emis: m.emissiveMap ? m.emissiveMap.uuid : null,
                  uv: o.geometry.attributes.uv ? [o.geometry.attributes.uv.count, o.geometry.attributes.uv.array.length] : null,
                  verts: o.geometry.attributes.position.count, tag: o.userData.tag || '' });
      if (m.map && m.emissiveMap) gores++;
    });
    return { gores, count: list.length, list: list.slice(0, 40) };
  });
  console.log('balloon[0] 内 mesh 数:', info.count, ' 带 map+emissiveMap 的:', info.gores);
  console.log(JSON.stringify(info.list.filter(x=>x.hasMap).slice(0,20)));
  // 给所有瓜瓣换同一张「21 条横带」贴图，每条颜色不同，直接读出每一行落在伞的什么高度
  await p.evaluate(() => {
    const P = window.__PROBE, T = window.__THREE;
    const bb = P.balloons[0];
    const c = document.createElement('canvas'); c.width = 128; c.height = 1024;
    const x = c.getContext('2d');
    for (let i = 0; i < 21; i++) {
      const h = 1024/21;
      x.fillStyle = i % 2 ? '#00ff00' : '#ff0000';
      x.fillRect(0, i*h, 128, h);
      x.fillStyle = '#000';
      x.fillRect(0, i*h, 128, 3);
      x.font = '30px monospace'; x.fillStyle = i%2?'#000':'#fff';
      x.fillText(String(i), 30, i*h + 40);
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    bb.g.traverse(o => {
      if (o.isMesh && o.material.map && o.material.emissiveMap) {
        o.material.map = t; o.material.emissiveMap = t; o.material.needsUpdate = true;
      }
    });
  });
  await p.evaluate(() => window.XM.shot('balloon-ground'));
  await p.waitForTimeout(3500);
  await p.screenshot({ path: '/tmp/bal_rows.png' });
  console.log('rows test saved');
  await b.close();
})();
