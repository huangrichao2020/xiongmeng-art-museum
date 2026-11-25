/* 导出当前场景所有 sprite 的世界坐标/尺寸/颜色/透明度，供离线投影分析 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
  const hour = process.env.HOUR || '17.5';
  await pg.evaluate((hour) => {
    window.diorama.setRain(0);
    const el = document.getElementById('hour'); el.value = String(hour); el.dispatchEvent(new Event('input'));
  }, hour);
  await pg.waitForTimeout(1200);
  const data = await pg.evaluate(() => {
    const out = { sprites: [], transparentMeshes: [] };
    const sc = window.diorama.scene();
    sc.traverse(o => {
      if (o.isSprite) {
        const p = o.getWorldPosition(new (o.position.constructor)());
        out.sprites.push({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), sx: +o.scale.x.toFixed(2), sy: +o.scale.y.toFixed(2), op: +o.material.opacity.toFixed(3), col: '#' + o.material.color.getHexString(), add: o.material.blending === 2 });
      } else if (o.isMesh && o.visible && o.material && o.material.transparent && o.material.opacity > 0.02) {
        const p = o.getWorldPosition(new (o.position.constructor)());
        const g = o.geometry;
        let r = 1;
        if (g) { if (!g.boundingSphere) g.computeBoundingSphere(); r = g.boundingSphere ? g.boundingSphere.radius : 1; }
        out.transparentMeshes.push({
          x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), r: +(r * Math.max(o.scale.x, o.scale.y, o.scale.z)).toFixed(2),
          op: +o.material.opacity.toFixed(3), col: '#' + (o.material.color ? o.material.color.getHexString() : 'ffffff'),
          add: o.material.blending === 2, mul: o.material.blending === 4, side: o.material.side, type: g && g.type
        });
      }
    });
    return out;
  });
  fs.writeFileSync('/tmp/sprites.json', JSON.stringify(data.sprites));
  fs.writeFileSync('/tmp/tmeshes.json', JSON.stringify(data.transparentMeshes));
  console.log('sprites', data.sprites.length, 'transparentMeshes', data.transparentMeshes.length);
  await b.close();
})();
