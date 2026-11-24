const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto('http://127.0.0.1:8811/', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.__PROBE && window.__PROBE.balloons, { timeout:120000 });
  await p.waitForTimeout(6000);
  const info = await p.evaluate(() => {
    const P = window.__PROBE, T = window.__THREE;
    const b = P.balloons[0];
    let gore = null;
    b.g.traverse(o => { if (!gore && o.material && o.material.map && o.material.emissiveMap) gore = o; });
    const g = gore.geometry;
    const pos = g.attributes.position.array, uv = g.attributes.uv.array;
    const US = 10;
    // 取第 0 行的 11 个顶点（v=0 那一行）和最后一行
    const first = [], last = [];
    for (let u = 0; u <= US; u++) { first.push([pos[u*3+1].toFixed(2), uv[u*2].toFixed(2), uv[u*2+1].toFixed(2)]); }
    const base = (10+1)*(10+1);
    for (let u = 0; u <= US; u++) { const i = (base-11+u); last.push([pos[i*3+1].toFixed(2), uv[i*2].toFixed(2), uv[i*2+1].toFixed(2)]); }
    const img = gore.material.map.image;
    return {
      mapSize: [img.width, img.height],
      flipY: gore.material.map.flipY,
      repeat: [gore.material.map.repeat.x, gore.material.map.repeat.y],
      offset: [gore.material.map.offset.x, gore.material.map.offset.y],
      firstRow: first, lastRow: last,
      dataUrl: img.toDataURL('image/png')
    };
  });
  console.log('mapSize', info.mapSize, 'flipY', info.flipY, 'repeat', info.repeat, 'offset', info.offset);
  console.log('v=0 行 (y, u, v):', JSON.stringify(info.firstRow.slice(0,3)));
  console.log('v=1 行 (y, u, v):', JSON.stringify(info.lastRow.slice(0,3)));
  fs.writeFileSync('/tmp/gore_tex.png', Buffer.from(info.dataUrl.split(',')[1], 'base64'));
  console.log('贴图已存 /tmp/gore_tex.png');
  await b.close();
})();
