/* 大本钟定点拍照（视觉验收）
   钟楼世界坐标推算：教堂组 ch.position=(-49,0,32)、rotation.y=π，
   钟盘中心局部 (0,15.9,7.1) → 世界 (-49, 15.9, 24.9)。 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.CLK_URL || 'https://preview.ai10088.com/alex-garage/?ui';

/* 站位用第一人称（diorama.fp.set），yaw 约定 forward=(-sin yaw,0,-cos yaw) */
const SHOTS = [
  { id: 'clk-wide',   p: [-42, 8, 6],      t: [-49, 16, 24.9],   fov: 56 },
  { id: 'clk-face',   p: [-49, 15.9, 18.2], t: [-49, 15.9, 24.9], fov: 58 },
  { id: 'clk-near',   p: [-49, 15.9, 20.4], t: [-49, 15.9, 24.9], fov: 62 },
  { id: 'clk-side',   p: [-32, 10, 24],     t: [-49, 16.5, 24.9], fov: 52 },
  { id: 'clk-ground', p: [-49, 2.0, 15],    t: [-49, 17, 24.9],   fov: 70 },
  /* 正对 +x 面（世界 x=-46.46），看盘到底渲没渲染出来 */
  { id: 'clk-ex',     p: [-38.4, 15.9, 24.9], t: [-46.46, 15.9, 24.9], fov: 60 },
  { id: 'clk-ex2',    p: [-40.0, 14.0, 22.0], t: [-46.46, 15.9, 24.9], fov: 60 },
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 120000 });
  await pg.waitForTimeout(3000);
  /* 登录（用探针专用号），否则登录卡片挡着画面 */
  await pg.evaluate(() => {
    const a = document.getElementById('mp-acc'), pw = document.getElementById('mp-pass');
    if (a && pw) { a.value = 'test03'; pw.value = '123456'; document.getElementById('mp-go').click(); }
  });
  await pg.waitForFunction(() => window.MP && window.MP.connected, null, { timeout: 30000 }).catch(() => { });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => { if (window.diorama) window.diorama.snow(false); });

  for (const s of SHOTS) {
    await pg.evaluate((s) => {
      window.diorama.fov(s.fov);
      window.MP.freezeCam(s.p[0], s.p[1], s.p[2], s.t[0], s.t[1], s.t[2]);
    }, s);
    await pg.waitForTimeout(1400);
    await pg.screenshot({ path: '/tmp/' + s.id + '.png' });
    const st = await pg.evaluate(() => window.diorama.time());
    console.log(s.id, '时间 =', JSON.stringify(st.clock), ' t =', st.t.toFixed(2));
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
