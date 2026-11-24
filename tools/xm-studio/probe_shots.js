/* 批量截图（对比用）：node probe_shots.js <site> <outdir> [shot1,shot2,...] */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2];
const OUT = process.argv[3];
const SHOTS = (process.argv[4] || 'balloon-above,museum-gate,tree-avenue,fair-gate,fountain-garden,anime-plaza,market-lane,church-front,theatre-front,plaza-night').split(',');
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(6000);
  for (const s of SHOTS) {
    await p.evaluate(x => window.XM.shot(x), s);
    await p.waitForTimeout(2600);
    await p.screenshot({ path: path.join(OUT, s + '.png') });
    console.log('shot', s);
  }
  await b.close();
})();
