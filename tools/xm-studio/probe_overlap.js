/* 左上角撞车体检：≡ 圆钮 / 时间牌 / 个人按钮 的实际重叠 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';
const VIEWS = [
  { n: 'desktop', w: 1280, h: 860, touch: false },
  { n: 'phone', w: 393, h: 873, touch: true },
];
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  for (const v of VIEWS) {
    const ctx = await b.newContext({
      viewport: { width: v.w, height: v.h },
      hasTouch: v.touch, isMobile: v.touch,
      userAgent: v.touch ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined
    });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 200)));
    await pg.goto(URL, { waitUntil: 'load', timeout: 180000 });
    await pg.waitForFunction(() => window.MP && window.diorama, null, { timeout: 180000 });
    await pg.waitForTimeout(6000);
    await pg.evaluate(() => { const e = document.getElementById('mp-login'); if (e) e.style.display = 'none'; });
    // 强制显示个人按钮（模拟登录后）
    await pg.evaluate(() => {
      const p = document.getElementById('mp-panel');
      if (p) { p.style.display = ''; p.classList.remove('open'); }
      document.body.classList.add('clean');
    });
    await pg.waitForTimeout(800);
    const rects = await pg.evaluate(() => {
      const ids = ['railToggle', 'cleanClock', 'mp-me-btn', 'mp-panel', 'wtools'];
      const out = {};
      for (const id of ids) {
        const el = document.getElementById(id) || document.querySelector('.' + id);
        if (!el) { out[id] = null; continue; }
        const r = el.getBoundingClientRect();
        out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), z: getComputedStyle(el).zIndex, disp: getComputedStyle(el).display };
      }
      return out;
    });
    console.log(v.n, JSON.stringify(rects));
    await pg.screenshot({ path: `/tmp/ovl_${v.n}.png`, clip: { x: 0, y: 0, width: Math.min(320, v.w), height: 200 } });
    await ctx.close();
  }
  await b.close();
})();
