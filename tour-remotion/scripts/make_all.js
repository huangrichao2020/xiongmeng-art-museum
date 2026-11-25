/* 把 11 段实拍素材拼成一条连续视频（public/all.mp4）
   ─────────────────────────────────────────────────────────
   Remotion 渲染时是服务端按 currentTime 抽帧。逐段各挂一个
   <OffthreadVideo> 时，每段边界会出 60~150 帧黑区（实测成片
   47~55 秒整段黑屏）。先拼成一条连续视频再抽帧，黑区消失。

   前提：public/seg-*.mp4 已经是严格 CFR 30fps（normalize_segments.js）。

   用法： node scripts/make_all.js
*/
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const PUB = path.resolve(__dirname, '../public');
const files = fs.readdirSync(PUB).filter(f => /^seg-\d+\.mp4$/.test(f)).sort();
if (!files.length) { console.error('public/ 下没有 seg-*.mp4'); process.exit(1); }

const listPath = path.join(PUB, '.concat-list.txt');
fs.writeFileSync(listPath, files.map(f => `file '${path.join(PUB, f)}'`).join('\n'), 'utf8');

const dst = path.join(PUB, 'all.mp4');
execFileSync('ffmpeg', [
  '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
  '-c', 'copy', '-movflags', '+faststart', dst,
], { stdio: ['ignore', 'ignore', 'inherit'] });
fs.unlinkSync(listPath);

const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-count_frames', '-show_entries', 'stream=nb_read_frames,duration,r_frame_rate,avg_frame_rate',
  '-of', 'default=nw=1', dst], { encoding: 'utf8' }).trim();
console.log('已拼接 ->', dst, `(${(fs.statSync(dst).size / 1048576).toFixed(1)}MB)`);
console.log(probe);
