/* 逐段录制宣传片素材（clean 模式）
   —— 每段录一个独立 mp4，画面里不烧字幕、不烧转场、不烧合成音效，
      全部交给 Remotion 按帧编排。

   用法：
     node record_segments.js --outdir /tmp/xm-seg              # 全部 11 段
     node record_segments.js --outdir /tmp/xm-seg --only 6,7    # 只录第 7、8 段
     node record_segments.js --outdir /tmp/xm-seg --from 0 --limit 3
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const PLAN = require('./tour_plan');
const RECORDER = path.join(__dirname, 'tour_recorder.js');

const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUTDIR = getArg('--outdir', '/tmp/xm-seg');
const ONLY = getArg('--only', '');           // "6,7" 0-based
const FROM = parseInt(getArg('--from', '0'), 10);
const LIMIT = parseInt(getArg('--limit', '0'), 10);
const HEADFUL = args.includes('--headful');

/* 段号（0-based）→ 需要录的清单 */
let list = PLAN.segments.map((s, i) => i);
if (ONLY) list = ONLY.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n < PLAN.segments.length);
else if (LIMIT > 0) list = PLAN.segments.map((s, i) => i).slice(FROM, FROM + LIMIT);

fs.mkdirSync(OUTDIR, { recursive: true });

(async () => {
  const b = await chromium.launch({
    executablePath: EXE, headless: !HEADFUL,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--disable-features=AudioServiceOutOfProcess']
  });

  for (const idx of list) {
    const seg = PLAN.segments[idx];
    const name = String(idx + 1).padStart(2, '0');
    const file = path.join(OUTDIR, `seg-${name}.mp4`);
    if (fs.existsSync(file) && fs.statSync(file).size > 100000 && !args.includes('--force')) {
      console.log(`段 ${name} 已存在，跳过（${(fs.statSync(file).size / 1048576).toFixed(1)}MB）`);
      continue;
    }
    console.log(`\n=== 录段 ${name}（${seg.kind}${seg.ride ? ':' + seg.ride : ''}, ${seg.dur}s）===`);

    const ctx = await b.newContext({
      viewport: { width: PLAN.width, height: PLAN.height },
      deviceScaleFactor: 1,
      acceptDownloads: true
    });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => console.log('  [pageerror]', String(e.stack || e).slice(0, 300)));
    pg.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 200)); });

    const dlPromise = pg.waitForEvent('download', { timeout: 20 * 60 * 1000 });
    await pg.goto(URL_, { waitUntil: 'load', timeout: 180000 });
    await pg.waitForFunction(() => window.MP && window.diorama && window.XM_TOUR, null, { timeout: 180000 });
    await pg.waitForTimeout(14000);

    await pg.evaluate(() => {
      for (const id of ['mp-login', 'mp-mask', 'mp-panel', 'mp-overlay', 'boot']) {
        const e = document.getElementById(id); if (e) e.style.display = 'none';
      }
      if (window.__fp) window.__fp.on = false;
      if (window.MP && window.MP.exitWalk) window.MP.exitWalk();
    });
    await pg.evaluate(() => { try { window.XM_TOUR.dpr(1); } catch (e) { } });
    await pg.waitForTimeout(2500);

    await pg.addScriptTag({ content: fs.readFileSync(RECORDER, 'utf8') });
    await pg.waitForFunction(() => !!window.__TOUR_REC, null, { timeout: 30000 });

    /* 只录这一段；clean=true → 不烧字幕/转场/合成音效 */
    const plan = {
      width: PLAN.width, height: PLAN.height, fps: PLAN.fps,
      clean: true,
      filename: `seg-${name}.mp4`,
      segments: [seg],
      subs: [], flashes: []
    };

    /* ride 段要预热：摩天轮/云霄飞车需要先转起来，相机才在正确位置 */
    if (seg.kind === 'ride') await pg.waitForTimeout(4000);

    const started = await pg.evaluate(p => window.__TOUR_REC.run(p), plan);
    console.log('  recorder:', JSON.stringify(started));

    const dl = await dlPromise;
    await dl.saveAs(file);
    const st = fs.statSync(file);
    console.log(`  ✓ seg-${name}.mp4  ${(st.size / 1048576).toFixed(1)}MB`);

    await pg.waitForTimeout(1000);
    const res = await pg.evaluate(() => window.__TOUR_RESULT);
    console.log('  统计:', JSON.stringify(res));

    await ctx.close();
  }

  await b.close();
  console.log('\n全部完成 →', OUTDIR);
})();
