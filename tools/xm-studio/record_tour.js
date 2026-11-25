/* 录制「穿越记忆」宣传片
   用法： node record_tour.js [--out /tmp/xm-tour.mp4] [--headful] */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const PLAN = require('./tour_plan');
const RECORDER = path.join(__dirname, 'tour_recorder.js');

const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = getArg('--out', '/tmp/xm-tour.mp4');
const HEADFUL = args.includes('--headful');
const SHOTS = getArg('--frames', '');   // 逗号分隔的关键时间点，额外抽帧

(async () => {
  const b = await chromium.launch({
    executablePath: EXE, headless: !HEADFUL,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--disable-features=AudioServiceOutOfProcess']
  });
  const pg = await (await b.newContext({
    viewport: { width: PLAN.width, height: PLAN.height },
    deviceScaleFactor: 1,
    acceptDownloads: true
  })).newPage();

  pg.on('pageerror', e => console.log('[pageerror]', String(e.stack || e).slice(0, 400)));
  pg.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 240)); });

  const dlPromise = pg.waitForEvent('download', { timeout: 30 * 60 * 1000 });
  await pg.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama && window.XM_TOUR, null, { timeout: 180000 });
  await pg.waitForTimeout(14000);

  // 藏 UI + 关掉第一人称，避免遮挡与相机争抢
  await pg.evaluate(() => {
    for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay', 'boot']) {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    }
    if (window.__fp) window.__fp.on = false;
    if (window.MP && window.MP.exitWalk) window.MP.exitWalk();
  });
  await pg.evaluate(() => { try { window.XM_TOUR.dpr(1); } catch (e) { } });
  await pg.waitForTimeout(2500);

  // 注入录制器
  await pg.addScriptTag({ content: fs.readFileSync(RECORDER, 'utf8') });
  await pg.waitForFunction(() => !!window.__TOUR_REC, null, { timeout: 30000 });

  const LIMIT = parseInt(getArg('--limit', '0'), 10);
  const FROM = parseInt(getArg('--from', '0'), 10);
  const sliced = LIMIT > 0 ? PLAN.segments.slice(FROM, FROM + LIMIT) : PLAN.segments.slice(FROM);
  const plan = LIMIT > 0
    ? { ...PLAN, segments: sliced, filename: PLAN.filename.replace('.mp4', '-test.mp4') }
    : { ...PLAN, segments: sliced };
  console.log('开始录制，总时长', plan.segments.reduce((a, s) => a + s.dur, 0), '秒');
  const started = await pg.evaluate(p => window.__TOUR_REC.run(p), plan);
  console.log('recorder:', JSON.stringify(started));

  // 关键时间点抽帧（录着的时候抓静态图，方便没录完也能看效果）
  const dl = await dlPromise;
  const savePath = (LIMIT > 0 || FROM > 0) ? OUT.replace(/\.mp4$/, '-test.mp4') : OUT;
  await dl.saveAs(savePath);
  const stat = fs.statSync(savePath);
  console.log('视频已保存:', savePath, (stat.size / 1048576).toFixed(1), 'MB');

  await pg.waitForTimeout(1200);
  const res = await pg.evaluate(() => window.__TOUR_RESULT);
  console.log('录制统计:', JSON.stringify(res));
  await b.close();
})();
