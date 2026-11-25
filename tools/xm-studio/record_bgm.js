/* 采集一条连续的 BGM 音轨（只录项目自己的音乐总线 musicBus，不录环境音）
   ─────────────────────────────────────────────────────────
   为什么单独录：
     11 段素材是 11 次独立录制，每次页面重新加载，BGM 旋律会从头重播，
     拼起来就是「同一段旋律在每一段开头又来一次」，一听就出戏。
     这里单独开一条长的、连续的 musicBus 录音，Remotion 里当音乐铺底用。

   做法：把 sfx.musicBus 接到 MediaStreamDestination，录成 audio-only 的 webm。

   用法： node record_bgm.js --out /tmp/xm-seg/bgm.webm [--dur 115]
*/
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');

const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const URL_ = (process.env.LOCAL_URL || 'http://127.0.0.1:8899/') + '?ui';

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = getArg('--out', '/tmp/xm-seg/bgm.webm');
const DUR = parseFloat(getArg('--dur', '115'));

(async () => {
  const b = await chromium.launch({
    executablePath: EXE, headless: true,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--disable-features=AudioServiceOutOfProcess']
  });
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, acceptDownloads: true
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[pageerror]', String(e.stack || e).slice(0, 300)));

  const dlPromise = pg.waitForEvent('download', { timeout: 15 * 60 * 1000 });
  await pg.goto(URL_, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.MP && window.diorama && window.XM_TOUR, null, { timeout: 180000 });

  console.log('等场景与音频采样就绪…');
  await pg.waitForTimeout(20000);

  /* 把相机停在艺术馆内部：updateBgmMix 会按「馆内/馆外」把 musicBus 增益
     切到 .52 / .30，馆内最饱满。相机不动 → 增益恒定 → 不会有呼吸感。 */
  await pg.evaluate(() => {
    const T = window.XM_TOUR;
    T.stopDirector();
    T.camera.position.set(6, 4.5, 6);
    T.controls.target.set(6, 6.2, 2);
    T.camera.lookAt(T.controls.target);
  });

  const ready = await pg.evaluate(() => ({
    on: window.XM_TOUR.sfx.on,
    piano: !!window.XM_TOUR.sfx.pianoReady,
    harp: !!window.XM_TOUR.sfx.harpReady,
    music: !!window.XM_TOUR.sfx.musicBus
  }));
  console.log('音频状态:', JSON.stringify(ready));

  /* 录音：只从 musicBus 取声（不接 master，避免把环境音也吃进来） */
  await pg.evaluate((dur) => {
    const T = window.XM_TOUR;
    const ctx2 = T.sfx.ctx;
    const dest = ctx2.createMediaStreamDestination();
    /* 前置增益 + 限幅：musicBus 户外增益只有 .30，整体很轻 */
    const pre = ctx2.createGain(); pre.gain.value = 3.0;
    const lim = ctx2.createDynamicsCompressor();
    lim.threshold.value = -8; lim.knee.value = 8; lim.ratio.value = 8;
    lim.attack.value = .004; lim.release.value = .18;
    pre.connect(lim); lim.connect(dest);
    T.sfx.musicBus.connect(pre);

    const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mime = mimes.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || 'audio/webm';
    const chunks = [];
    const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 160000 });
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(500);
    window.__BGM_DONE = false;
    setTimeout(() => {
      rec.stop();
      setTimeout(() => {
        const blob = new Blob(chunks, { type: mime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'bgm.webm';
        document.body.appendChild(a); a.click();
        window.__BGM_DONE = true;
      }, 800);
    }, dur * 1000);
  }, DUR);

  console.log(`录 BGM ${DUR}s…`);
  await pg.waitForFunction(() => window.__BGM_DONE, null, { timeout: (DUR + 60) * 1000 });
  const dl = await dlPromise;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await dl.saveAs(OUT);
  console.log('BGM 已保存:', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1), 'MB');

  await b.close();
})();
