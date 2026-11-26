/* 把 11 段实拍素材拼成一条连续视频（public/all.mp4）
   ─────────────────────────────────────────────────────────
   Remotion 渲染时是服务端按 currentTime 抽帧。逐段各挂一个
   <OffthreadVideo> 时，每段边界会出 60~150 帧黑区（实测成片
   47~55 秒整段黑屏）。先拼成一条连续视频再抽帧，黑区消失。

   ⚠️ 关键坑（2026-11-26 实测修复）：
   直接 `concat demuxer + -c copy` 会让 **段与段之间出现时间戳缝隙**。
   原因：每段素材的音频流（MediaRecorder 出来的 AAC）比视频流长
   0.02~0.11 秒，concat 用「容器时长」算下一段的偏移量，差值逐段累加，
   实测 11 段累计多出 24.5 帧（0.82 秒）。

   后果很隐蔽：
     · Remotion 按**时间戳**抽帧 → 画面内容越往后越晚，
       而字幕/章节是按**帧号**摆的 → 字幕和画面对不上，最多偏 0.82 秒；
     · 成片总长比素材短 0.82 秒 → 片尾最后一拍被砍掉。

   解法：视频流和音频流**分开拼**，各自对齐到段落的精确帧数：
     1. 视频：每段 `-c copy -an` 剥出纯视频流，容器时长 == 视频时长，
        concat 出来时间戳严丝合缝（每帧 Δ=1）。
     2. 音频：每段用 atrim+apad 裁/补到 **精确** N/30 秒，存 wav（无编码
        padding），再 concat 成一条，最后统一编成 aac。
     3. 视频 + 音频 mux 成 all.mp4。
   视频码流全程零重编码，不掉画质。

   脚本最后会**自动校验**：逐帧 pts 差必须全为 1 帧、总帧数必须等于
   各段帧数之和。对不上直接报错退出，不让脏素材流到渲染环节。

   用法： node scripts/make_all.js
*/
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const PUB = path.resolve(__dirname, '../public');
const TMP = path.resolve(__dirname, '../.alltmp');
const FPS = 30;

const files = fs.readdirSync(PUB).filter(f => /^seg-\d+\.mp4$/.test(f)).sort();
if (!files.length) { console.error('public/ 下没有 seg-*.mp4'); process.exit(1); }

fs.mkdirSync(path.join(TMP, 'v'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'a'), { recursive: true });

const run = (args) => execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
const frameCount = (f) => parseInt(execFileSync('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0', '-count_frames',
  '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f,
], { encoding: 'utf8' }).trim(), 10);

const vList = [], aList = [];
let total = 0;

for (const f of files) {
  const src = path.join(PUB, f);
  const n = frameCount(src);
  if (!Number.isFinite(n) || n <= 0) { console.error(`${f} 帧数探测失败`); process.exit(1); }
  total += n;
  const dur = (n / FPS).toFixed(6);

  /* 视频：剥掉音频，只留视频流（容器时长 == 视频时长） */
  const vOut = path.join(TMP, 'v', f);
  run(['-y', '-i', src, '-map', '0:v:0', '-c', 'copy', '-an', vOut]);

  /* 音频：精确裁/补到 n/30 秒，存 wav（没有 AAC padding，容器时长精确） */
  const aOut = path.join(TMP, 'a', f.replace(/\.mp4$/, '.wav'));
  run(['-y', '-i', src, '-map', '0:a:0',
    '-af', `atrim=0:${dur},apad=whole_dur=${dur}`,
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', aOut]);

  vList.push(vOut); aList.push(aOut);
  console.log(`${f}  ${n} 帧  ${dur}s`);
}

const writeList = (arr, out) => {
  fs.writeFileSync(out, arr.map(p => `file '${p}'`).join('\n'), 'utf8');
  return out;
};

/* 1. 拼视频（零重编码） */
const allv = path.join(TMP, 'allv.mp4');
run(['-y', '-f', 'concat', '-safe', '0', '-i', writeList(vList, path.join(TMP, 'vlist.txt')),
  '-c', 'copy', allv]);

/* 2. 拼音频（统一编 aac） */
const alla = path.join(TMP, 'alla.m4a');
run(['-y', '-f', 'concat', '-safe', '0', '-i', writeList(aList, path.join(TMP, 'alist.txt')),
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', alla]);

/* 3. mux */
const dst = path.join(PUB, 'all.mp4');
run(['-y', '-i', allv, '-i', alla, '-map', '0:v', '-map', '1:a',
  '-c', 'copy', '-movflags', '+faststart', dst]);

/* ── 自动校验 ──
   逐帧 pts 差必须全是 1 帧、总帧数必须等于各段之和。
   这一步就是「自动验收而不是肉眼」：时间戳一旦有缝，立刻在这里炸掉。 */
const ptsTxt = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', dst], { encoding: 'utf8' });
const pts = ptsTxt.split('\n').filter(s => s.trim()).map(s => parseFloat(s));
let bad = 0;
for (let i = 1; i < pts.length; i++) {
  const d = (pts[i] - pts[i - 1]) * FPS;
  if (Math.abs(d - 1) > 0.02) { bad++; console.error(`  ⚠ 帧 ${i - 1}→${i} 时间戳跳 ${d.toFixed(3)} 帧`); }
}
const real = frameCount(dst);
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', dst], { encoding: 'utf8' }).trim();

console.log(`\n已拼接 -> ${dst}  (${(fs.statSync(dst).size / 1048576).toFixed(1)}MB)`);
console.log(`帧数 ${real} / 预期 ${total}   总时长 ${dur}s / 预期 ${(total / FPS).toFixed(6)}s`);
if (bad || real !== total) {
  console.error(`\n✗ 校验失败：${bad} 处时间戳缝隙，帧数 ${real} ≠ ${total}`);
  process.exit(1);
}
console.log('✓ 校验通过：时间戳逐帧连续，无缝隙');
