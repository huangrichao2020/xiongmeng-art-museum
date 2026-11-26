/* 手指落点被谁挡住：把摇杆周围一圈的元素命中情况打出来 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const W = 390, H = 844;
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.diorama, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { const el = document.getElementById('mp-login'); if (el) el.style.display = 'none'; });
  await pg.waitForTimeout(1200);

  const rects = await pg.evaluate(() => {
    const ids = ['joystick', 'stick', 'train-hud', 'hand-hud', 'w-run', 'xmsg', 'tip', 'hint', 'wtools'];
    const out = {};
    ids.forEach(id => { const el = document.getElementById(id); if (!el) return; const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), disp: cs.display, pe: cs.pointerEvents, z: cs.zIndex, vis: cs.visibility, op: cs.opacity }; });
    return out;
  });
  console.log('元素矩形:', JSON.stringify(rects, null, 1));

  async function grid(tag) {
    const g = await pg.evaluate(() => {
      const out = [];
      for (let y = 680; y <= 840; y += 20) {
        let row = 'y=' + y + ' : ';
        for (let x = 0; x <= 200; x += 20) {
          const el = document.elementFromPoint(x, y);
          row += (el ? (el.id || el.tagName) : 'null').padEnd(14).slice(0, 13) + ' ';
        }
        out.push(row);
      }
      return out;
    });
    console.log('--- ' + tag);
    g.forEach(r => console.log(r));
  }
  await grid('默认状态（提示条未显示）');

  // 强制显示底部提示条，再测一次
  await pg.evaluate(() => {
    const el = document.getElementById('train-hud');
    el.classList.add('show');
    document.getElementById('train-msg').textContent = '走近设施才会上车';
  });
  await pg.waitForTimeout(400);
  await grid('提示条显示时');
  await b.close();
})();
