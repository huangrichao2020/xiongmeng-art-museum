/* 实测录制：XM.record 在指定机位录 4 秒，看实测帧率 + 产物校验 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2];
const SHOT = process.argv[3] || 'balloon-above';
const OUT = process.argv[4] || '/tmp/recout';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(6000);
  await p.evaluate(s => window.XM.shot(s), SHOT);
  await p.waitForTimeout(3000);
  const r = await p.evaluate(async (shot) => {
    const t0 = performance.now();
    const r = await window.XM.record({ shot, duration: 4 });
    return { ok: r.ok, error: r.error, mime: r.mime, size: r.size, recFps: r.recFps, dpr: r.dpr, wall: Math.round(performance.now() - t0), b64: r.base64 ? r.base64.slice(0, 40) : null };
  }, SHOT);
  console.log('录制结果:', JSON.stringify({ ...r, b64: undefined }));
  // 单独抓一份 base64 存文件
  const b64 = await p.evaluate(async (shot) => {
    const r = await window.XM.record({ shot, duration: 4 });
    return r.base64 || '';
  }, SHOT);
  const f = path.join(OUT, SHOT + (r.mime && r.mime.indexOf('mp4') >= 0 ? '.mp4' : '.webm'));
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  console.log('文件:', f, fs.statSync(f).size, 'bytes');
  await b.close();
})();
