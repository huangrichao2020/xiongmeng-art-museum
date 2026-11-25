/* 加载耗时归因：CPU profile 取自加载阶段 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = process.env.LOCAL_URL || 'https://preview.ai10088.com/alex-garage/?ui';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await pg.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  const tLoad = Date.now() - t0;
  await pg.waitForFunction(() => window.MP && window.MP.freezeCam, null, { timeout: 180000 });
  await pg.waitForTimeout(500);
  const { profile } = await cdp.send('Profiler.stop');

  // 汇总 self time
  const byFn = new Map();
  const nodes = new Map();
  profile.nodes.forEach(n => nodes.set(n.id, n));
  const self = new Map();
  const dt = profile.timeDeltas || [];
  profile.samples.forEach((id, i) => {
    const d = dt[i] || 0;
    self.set(id, (self.get(id) || 0) + d);
  });
  const rows = [];
  self.forEach((us, id) => {
    const n = nodes.get(id); if (!n) return;
    const f = n.callFrame;
    const name = (f.functionName || '(anon)') + ' @' + (f.url || '').split('/').pop() + ':' + f.lineNumber;
    rows.push({ name, ms: Math.round(us / 1000) });
  });
  rows.sort((a, b2) => b2.ms - a.ms);
  console.log('LOAD ' + tLoad + 'ms  (profile total ' + Math.round(profile.endTime - profile.startTime) / 1000 + 'ms)');
  console.log('TOP SELF TIME:');
  rows.slice(0, 22).forEach(r => console.log('  ' + String(r.ms).padStart(6) + 'ms  ' + r.name));
  await b.close();
})();
