const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const TAG = process.argv[3] || 'x';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1200,height:800}})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,180)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(8000);
  const snap = async (label) => {
    const st = await p.evaluate(() => {
      const P = window.__PROBE;
      const hud = P.trainHud, msg = P.trainMsgEl, btn = P.trainBtnEl;
      return {
        show: hud.classList.contains('show'), bare: hud.classList.contains('bare'),
        msgDisplay: getComputedStyle(msg).display,
        msgText: msg.textContent.slice(0,60), btnText: btn.textContent,
        hasOnclick: !!btn.onclick,
        hudBox: (() => { const r = hud.getBoundingClientRect(); return [Math.round(r.width),Math.round(r.height),Math.round(r.left),Math.round(r.top)]; })()
      };
    });
    console.log(label, JSON.stringify(st));
    await p.screenshot({ path: `/tmp/hud_${TAG}_${label}.png`, clip: { x: 380, y: 640, width: 440, height: 120 } });
  };
  // 1) 乘热气球
  await p.evaluate(() => window.__PROBE.toggleBalloonRide(0));
  await p.waitForTimeout(2500);
  await snap('balloon-riding');
  // 2) 下车
  await p.evaluate(() => window.__PROBE.toggleBalloonRide(0));
  await p.waitForTimeout(1500);
  await snap('balloon-stopped');
  // 3) 靠近提示（没上车时）
  await p.evaluate(() => window.__PROBE.hudShow('大号热气球 · 按 E 或点击登上吊篮（升空后 W/↑ 上升、S/↓ 下降）','上热气球 (E)',()=>{}));
  await p.waitForTimeout(600);
  await snap('near');
  await b.close();
})();
