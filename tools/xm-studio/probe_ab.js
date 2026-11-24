/* 固定相机 A/B 对比：同一机位、同参数，关掉镜头漂移与自转，量 calls + 帧率（多轮取中位） */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2];
const LABEL = process.argv[3] || 'site';
const VIEWS = [
  { name: '全景俯瞰', pos: [-45, 40, 48], look: [-4, 1, 22], fov: 66 },
  { name: '摩天轮顶', pos: [27, 30, 36], look: [10, 4, 24], fov: 62 },
  { name: '艺术馆正门', pos: [24, 4.6, 23], look: [6, 6.2, 2], fov: 58 },
  { name: '雪松大道', pos: [30, 3.0, 15], look: [-14, 4.2, 9.5], fov: 60 },
  { name: '喷泉花园', pos: [-15, 3.4, 8], look: [-24.4, 1.4, 0.2], fov: 56 }
];
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(7000);
  console.log('== ' + LABEL + ' ==');
  for (const v of VIEWS) {
    await p.evaluate((vw) => {
      const P = window.__PROBE;
      if (P.XM && P.XM.stop) P.XM.stop();
      P.controls.autoRotate = false;
      P.camera.fov = vw.fov; P.camera.updateProjectionMatrix();
      P.camera.position.set(vw.pos[0], vw.pos[1], vw.pos[2]);
      P.camera.lookAt(vw.look[0], vw.look[1], vw.look[2]);
      P.controls.target.set(vw.look[0], vw.look[1], vw.look[2]);
      P.controls.update();
    }, v);
    await p.waitForTimeout(1200);
    const r = await p.evaluate(async () => {
      const out = [];
      for (let round = 0; round < 3; round++) {
        const t = await new Promise(res => {
          const times = []; let last = performance.now(); let i = 0;
          const tick = () => { const now = performance.now(); times.push(now - last); last = now; if (++i >= 70) { const s = times.slice(6).sort((a, b) => a - b); res(+(1000 / s[Math.floor(s.length / 2)]).toFixed(1)); } requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        out.push(t);
        await new Promise(r => setTimeout(r, 250));
      }
      const info = window.__PROBE.renderer.info.render;
      return { fps: out.sort((a, b) => a - b)[1], calls: info.calls, tris: info.triangles };
    });
    console.log(v.name.padEnd(14), String(r.fps).padStart(6) + 'fps', String(r.calls).padStart(6) + 'calls', String(r.tris).padStart(9) + 'tris');
  }
  await b.close();
})();
