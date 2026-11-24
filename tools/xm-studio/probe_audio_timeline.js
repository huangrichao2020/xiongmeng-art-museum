/* 录音：把 WebAudio 里每一个发声节点记下来，看哪些是周期性的「齿轮声」 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = 'https://preview.ai10088.com/alex-garage/';
const SECS = +(process.argv[2] || 48);
(async () => {
  const b = await chromium.launch({
    executablePath: EXE,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const c = await b.newContext({ viewport: { width: 900, height: 600 } });
  await c.addInitScript(() => {
    window.__alog = [];
    const AC = window.AudioContext;
    const oo = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () {
      const o = oo.call(this), rec = { kind: 'osc', t: 0, type: '', freq: 0, stop: 0 };
      window.__alog.push(rec);
      const st = o.start.bind(o), sp = o.stop.bind(o);
      o.start = (w) => { rec.t = this.currentTime; rec.type = o.type; rec.freq = o.frequency.value; return st(w); };
      o.stop = (w) => { rec.stop = this.currentTime; return sp(w); };
      return o;
    };
    const ob = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () {
      const s = ob.call(this), rec = { kind: 'buf', t: 0, rate: 1, dur: 0, stop: 0 };
      window.__alog.push(rec);
      const st = s.start.bind(s), sp = s.stop.bind(s);
      s.start = (w, off, dur) => { rec.t = this.currentTime; rec.rate = s.playbackRate.value; rec.dur = dur || 0; return st(w, off, dur); };
      s.stop = (w) => { rec.stop = this.currentTime; return sp(w); };
      return s;
    };
  });
  const pg = await c.newPage();
  pg.on('pageerror', e => console.log('[err]', String(e).slice(0, 140)));
  await pg.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.MP, { timeout: 120000 });
  await pg.waitForTimeout(4000);
  /* 触发手势，让 AudioContext 跑起来 */
  await pg.mouse.click(450, 300);
  await pg.waitForTimeout(1200);
  const st = await pg.evaluate(() => {
    const s = window.sfx || null;
    return { hasSfx: !!s, on: s ? s.on : null, state: s && s.ctx ? s.ctx.state : null, log: window.__alog.length };
  });
  console.log('[起始]', JSON.stringify(st));
  await pg.waitForTimeout(SECS * 1000);
  const log = await pg.evaluate(() => window.__alog);
  const t0 = log.length ? log[0].t : 0;
  const rows = log.map(r => ({
    t: +(r.t - t0).toFixed(3), kind: r.kind, type: r.type || '', freq: r.freq ? Math.round(r.freq) : '',
    rate: r.rate ? +r.rate.toFixed(3) : '', dur: r.dur ? +r.dur.toFixed(2) : '', stop: r.stop ? +(r.stop - t0).toFixed(3) : '',
  }));
  console.log('[总发声节点]', rows.length);
  /* 按频率聚类 */
  const byKey = {};
  for (const r of rows) {
    const k = r.kind === 'osc' ? 'osc ' + r.type + ' ' + r.freq + 'Hz' : 'buf rate ' + r.rate;
    (byKey[k] = byKey[k] || []).push(r.t);
  }
  const stat = Object.entries(byKey).map(([k, ts]) => {
    ts = ts.slice().sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < ts.length; i++) gaps.push(+(ts[i] - ts[i - 1]).toFixed(3));
    return { kind: k, n: ts.length, first: ts[0], last: ts[ts.length - 1], gaps: gaps.slice(0, 12).join(',') };
  }).sort((a, b) => b.n - a.n);
  console.log('[按音色聚类]');
  for (const s of stat) console.log('  ', JSON.stringify(s));
  /* 找周期 > 8s 的重复（雪橇一圈 39.3s）*/
  console.log('[周期>8s 的事件]');
  for (const s of stat) {
    const ts = [];
    const k = s.kind;
    for (const r of rows) { const kk = r.kind === 'osc' ? 'osc ' + r.type + ' ' + r.freq + 'Hz' : 'buf rate ' + r.rate; if (kk === k) ts.push(r.t); }
    ts.sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g > 8) console.log('   ', k, '间隔', g.toFixed(2), 's @', ts[i - 1].toFixed(2)); }
  }
  require('fs').writeFileSync('/tmp/audio_timeline.json', JSON.stringify(rows));
  await b.close();
})();
