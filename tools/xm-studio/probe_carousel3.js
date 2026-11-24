/* 木马：转速 / 马匹起伏 / 骑手是否已删 + 流星粗细 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 140)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => { const w = document.getElementById('mp-login'); if (w) w.style.display = 'none'; });

  /* 骑上木马，采样相机：水平绕圈 = 转盘在转；竖直起伏 = 马在跑 */
  await pg.evaluate(() => { try { window.diorama.ride('carousel'); } catch (e) { } });
  await pg.waitForTimeout(2500);
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await pg.waitForTimeout(300);
    samples.push(await pg.evaluate(() => { const c = window.diorama.cam(); return [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)]; }));
  }
  console.log('[相机轨迹 x,y,z]', JSON.stringify(samples));
  const ys = samples.map(s => s[1]);
  console.log('[竖直起伏幅度]', (Math.max(...ys) - Math.min(...ys)).toFixed(3), 'm');
  /* 水平转过的角度 */
  const ang = s => Math.atan2(s[2] - 30, s[0] - 4);
  let d = ang(samples[samples.length - 1]) - ang(samples[0]);
  while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  const dt = 9 * 0.3;
  console.log('[3 秒转过角度]', (d * 180 / Math.PI).toFixed(1), '°  → 转速', (d / dt).toFixed(2), 'rad/s');
  await pg.screenshot({ path: '/tmp/car_after.png' });

  /* 流星：抬头看天，拍两帧比"光的粗细" */
  await pg.evaluate(() => { try { window.diorama.ride('carousel'); } catch (e) { } });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { if (window.diorama.fp.get().on) document.getElementById('t-fp').click(); });
  await pg.waitForTimeout(1000);
  await pg.evaluate(() => MP.freezeCam(0, 6, 20, 0, 30, 26));
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: '/tmp/meteor_after.png' });
  console.log('[流星截图已存]');
  await b.close();
})();
