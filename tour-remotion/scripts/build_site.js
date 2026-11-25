/* 把成片 + 字幕 + 章节 + 播放器页面打包到发布目录
   ─────────────────────────────────────────────────────────
   用法：
     node build_site.js --video <成片.mp4> [--outdir ../tour] [--subdir /tmp/xm-sub]
*/
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const VIDEO = getArg('--video', path.join(__dirname, '../out/xm-tour.mp4'));
const OUTDIR = getArg('--outdir', path.join(__dirname, '..'));
const SUBDIR = getArg('--subdir', '/tmp/xm-sub');
const PAGE = getArg('--page', path.resolve(__dirname, '../../tour/index.html'));

fs.mkdirSync(OUTDIR, { recursive: true });

/* 1. 成片 —— 转成 iOS Safari 友好的 mp4（H.264 + AAC + faststart） */
const dst = path.join(OUTDIR, 'xm-tour.mp4');
execFileSync('ffmpeg', [
  '-y', '-i', VIDEO,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
  '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
  '-movflags', '+faststart',
  dst
], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log('成片:', dst, (fs.statSync(dst).size / 1048576).toFixed(1), 'MB');

/* 2. 字幕文件 */
for (const f of ['xm-tour.srt', 'xm-tour.txt']) {
  const s = path.join(SUBDIR, f);
  if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(OUTDIR, f)); console.log('字幕:', f); }
}

/* 3. 章节表注入播放器页面 */
const chj = path.join(SUBDIR, 'xm-tour-chapters.json');
const chapters = JSON.parse(fs.readFileSync(chj, 'utf8')).chapters;
let html = fs.readFileSync(PAGE, 'utf8');
const inject = '<!--CHAPTERS--><script>window.__CHAPTERS=' + JSON.stringify(chapters) + ';</script>';
if (html.includes('<!--CHAPTERS-->')) html = html.replace('<!--CHAPTERS-->', inject);
else html = html.replace('</head>', inject + '\n</head>');
fs.writeFileSync(path.join(OUTDIR, 'index.html'), html, 'utf8');
console.log('播放器页: index.html（章节', chapters.length, '段）');

/* 4. 封面 —— 取第 3 秒那一帧 */
const poster = path.join(OUTDIR, 'poster.jpg');
execFileSync('ffmpeg', ['-y', '-ss', '3', '-i', dst, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '4', poster],
  { stdio: ['ignore', 'ignore', 'ignore'] });
if (fs.existsSync(poster)) console.log('封面: poster.jpg');

/* 5. 报告 —— 音量检查（ffmpeg 的统计走 stderr，单独用 shell 跑） */
const vol = execFileSync('bash', ['-c',
  `ffmpeg -hide_banner -i "${dst}" -af volumedetect -f null /dev/null 2>&1 | grep -E "mean_volume|max_volume"`],
  { encoding: 'utf8' });
vol.split('\n').filter(l => /mean_volume|max_volume/.test(l)).forEach(l => console.log(l.trim()));
