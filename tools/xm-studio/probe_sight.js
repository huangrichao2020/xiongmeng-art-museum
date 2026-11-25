/* 视线遮挡体检：站在马路中心，朝四个方向扫射线，列出近处挡视线的实体 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8899/?ui', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.diorama && window.diorama.scene, null, { timeout: 120000 });
  await pg.waitForTimeout(9000);
  const yaws = [0, -Math.PI / 2, Math.PI, Math.PI / 2];   // 北 东 南 西
  const pits = [0, 0.08, 0.16, 0.24, 0.32, 0.42];
  const spots = [
    ['南段中线', [0, 1.55, 15.4]],
    ['南段西侧', [-24, 1.55, 15.4]],
    ['北段中线', [0, 1.55, -21.0]],
    ['东段', [54, 1.55, 2.0]]
  ];
  for (const [name, o] of spots) {
    const r = await pg.evaluate(([o, yaws, pits]) => {
      const hits = window.diorama.sight(o, yaws, pits, 45);
      /* 只留 0.5~18m 的近处命中，按 yaw 分组 */
      const near = hits.filter(h => h.d < 18);
      const byYaw = {};
      for (const h of near) {
        const k = h.yaw + '/' + h.pit;
        if (!byYaw[k]) byYaw[k] = [];
        byYaw[k].push(h.d + 'm ' + h.c + (h.op < 1 ? '(透' + h.op + ')' : '') + (h.tag ? '[' + h.tag + ']' : ''));
      }
      const lines = [];
      for (const k of Object.keys(byYaw).sort()) lines.push(k + ' → ' + byYaw[k].slice(0, 3).join(' , '));
      return lines;
    }, [o, yaws, pits]);
    console.log('=== ' + name + ' ' + JSON.stringify(o) + ' ===');
    r.forEach(l => console.log('  ' + l));
  }
  console.log(errs.length ? 'ERRORS ' + errs.slice(0, 3).join(' | ') : 'no page errors');
  await b.close();
})();
