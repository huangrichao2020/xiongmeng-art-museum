/* 用实拍素材的真实时长校准时间轴
   ─────────────────────────────────────────────────────────
   录制时 MediaRecorder 收尾会丢掉最后 ~0.1s，所以每段实际时长
   比 plan 里写的略短。Remotion 的 Sequence 长度如果按 plan 写，
   末尾会露出黑帧。这里读 ffprobe 的真实时长回填 timeline.ts。

   用法： node build_timeline.js [--segdir /tmp/xm-seg] [--ts <path to timeline.ts>]
*/
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
/* 默认量 Remotion 真正读的那个目录（public/），不要量原始录制目录：
   原始 MediaRecorder 出来的是变帧率、时间戳坏的 mp4，时长对不上。 */
const SEGDIR = path.resolve(getArg('--segdir', path.join(__dirname, '../public')));
const TSPATH = path.resolve(getArg('--ts', path.join(__dirname, '../src/timeline.ts')));

/* 从 timeline.ts 里读出每段的 dur，顺序与文件名对应 */
const src = fs.readFileSync(TSPATH, 'utf8');
const durs = [];
const re = /src:\s*'seg-(\d+)\.mp4',\s*dur:\s*([\d.]+)/g;
let m;
while ((m = re.exec(src))) durs.push({ n: parseInt(m[1], 10), dur: parseFloat(m[2]) });
if (!durs.length) { console.error('timeline.ts 里没解析到段信息'); process.exit(1); }

const changed = [];
for (const d of durs) {
  const f = path.join(SEGDIR, `seg-${String(d.n).padStart(2, '0')}.mp4`);
  if (!fs.existsSync(f)) { console.log(`跳过 seg-${d.n}（还没录）`); continue; }
  /* 量真实帧数，而不是容器时长 —— OffthreadVideo 按帧取，超出就是黑帧 */
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=nb_read_frames',
    '-of', 'csv=p=0', f
  ], { encoding: 'utf8' }).trim();
  const nFrames = parseInt(out, 10);
  if (!Number.isFinite(nFrames) || nFrames <= 0) {
    console.log(`跳过 seg-${d.n}（帧数探测失败）`); continue;
  }
  const real = nFrames / 30;
  const plan = d.dur;
  if (Math.abs(real - plan) > 0.02) {
    changed.push({ n: d.n, plan, real: +real.toFixed(3) });
    /* 向上取到帧边界，避免 Sequence 末尾露黑 */
    const frames = nFrames;
    const use = +(frames / 30).toFixed(3);
    const re2 = new RegExp(`(src:\\s*'seg-${String(d.n).padStart(2, '0')}\\.mp4',\\s*dur:\\s*)${plan}`);
    let s2 = fs.readFileSync(TSPATH, 'utf8');
    s2 = s2.replace(re2, `$1${use}`);
    fs.writeFileSync(TSPATH, s2, 'utf8');
    console.log(`seg-${String(d.n).padStart(2, '0')}: ${plan}s → ${use}s (实测 ${real.toFixed(3)}s)`);
  } else {
    console.log(`seg-${String(d.n).padStart(2, '0')}: ${plan}s (一致)`);
  }
}
console.log(changed.length ? `\n已更新 ${changed.length} 段` : '\n无需更新');
