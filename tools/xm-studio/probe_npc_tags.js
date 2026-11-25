/* NPC 名牌体检：① 名字有没有数字后缀 ② 名牌会不会穿墙 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 220)));
  await pg.goto((process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(9000);
  await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });

  const names = await pg.evaluate(() => window.diorama.npcNames());
  const withDigit = names.filter(n => /[0-9０-９]/.test(n));
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  console.log('NPC 总数:', names.length);
  console.log('带数字的名字:', withDigit.length ? JSON.stringify(withDigit) : '无');
  console.log('重复的名字:', dup.length ? JSON.stringify(dup) : '无');
  console.log('抽样:', JSON.stringify(names.slice(0, 14)));

  /* 名牌贴图材质是否开了深度测试 */
  const dt = await pg.evaluate(() => {
    const out = [];
    window.diorama.scene().traverse(o => {
      if (o.isSprite) out.push({ depthTest: o.material.depthTest, w: +o.scale.x.toFixed(2) });
    });
    return out;
  });
  const noTest = dt.filter(s => !s.depthTest);
  console.log('sprite 总数:', dt.length, ' 关掉深度测试的:', noTest.length ? JSON.stringify(noTest) : '无');

  /* 站在艺术馆外面往里看：馆内 NPC 的名牌必须被墙挡住 */
  await pg.evaluate(() => { const el = document.getElementById('hour'); el.value = '13'; el.dispatchEvent(new Event('input')); });
  await pg.waitForTimeout(1200);
  await pg.evaluate(a => window.MP.freezeCam(a[0], a[1], a[2], a[3], a[4], a[5]), [0, 4.2, 12, 0, 1.6, -6]);
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: '/tmp/np_wall_out.png' });
  console.log('shot np_wall_out');
  console.log('errs:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
