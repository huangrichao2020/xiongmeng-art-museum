/* 把 MediaRecorder 录出的变帧率 mp4 统一转成严格 CFR 30fps
   ─────────────────────────────────────────────────────────
   浏览器 MediaRecorder 出来的 mp4 是 VFR（r_frame_rate 报 30000/1，
   实际每段时间戳都不一样）。Remotion 的 OffthreadVideo 按 CFR 抽帧，
   遇到 VFR 素材会抽到空白帧 —— 实测第 47~55 秒整段黑屏，
   而素材本身用 ffmpeg 抽帧完全正常。

   这里统一转成 CFR：帧率固定 30、时间戳连续、关键帧间隔 2 秒，
   Remotion 抽帧就稳定了。

   用法： node normalize_segments.js [--segdir /tmp/xm-seg] [--pubdir ../public]
*/
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEGDIR = getArg('--segdir', '/tmp/xm-seg');
const PUBDIR = getArg('--pubdir', path.resolve(__dirname, '../public'));
const FPS = 30;

fs.mkdirSync(PUBDIR, { recursive: true });

const files = fs.readdirSync(SEGDIR).filter(f => /^seg-\d+\.mp4$/.test(f)).sort();
for (const f of files) {
  const src = path.join(SEGDIR, f);
  const dst = path.join(PUBDIR, f);
  execFileSync('ffmpeg', [
    '-y', '-i', src,
    '-vf', `fps=${FPS}`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart',
    '-vsync', 'cfr', '-r', String(FPS),
    dst
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate,avg_frame_rate', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', dst], { encoding: 'utf8' }).trim().split('\n');
  console.log(`${f}  ${(fs.statSync(dst).size / 1048576).toFixed(1)}MB  ${probe.join('  ')}`);
}
console.log('已规范化 →', PUBDIR);
