/* 生成 SRT 字幕 + 章节 JSON + 播放器章节表
   ─────────────────────────────────────────────────────────
   时间轴直接从 Remotion 的 src/timeline.ts 解析，
   不另存一份 —— 两处维护必然会不同步。
   每段字幕的绝对时间 = 段起点 + 段内相对时间。

   用法： node make_subs.js <输出目录> [--ts <timeline.ts 路径>]
*/
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = args[0] && !args[0].startsWith('--') ? args[0] : '/tmp';
const TSPATH = getArg('--ts', path.join(__dirname, '../../tour-remotion/src/timeline.ts'));

fs.mkdirSync(outDir, { recursive: true });

/* ── 解析 timeline.ts ── */
const src = fs.readFileSync(TSPATH, 'utf8');
const segRe = /src:\s*'seg-(\d+)\.mp4',\s*dur:\s*([\d.]+),\s*chapter:\s*'([^']*)'/g;
const segs = [];
let m;
while ((m = segRe.exec(src))) {
  segs.push({ n: parseInt(m[1], 10), dur: parseFloat(m[2]), chapter: m[3] });
}
if (!segs.length) { console.error('timeline.ts 里没解析到段信息：', TSPATH); process.exit(1); }

/* 每段里的字幕：形如 subs: [{ at: .9, dur: 7.0, fx: 'card', title: '...', sub: '...' }] */
function parseSubsOf(segIdx) {
  /* 找出第 segIdx 个段的整个对象文本 */
  const marker = `seg-${String(segs[segIdx].n).padStart(2, '0')}.mp4`;
  const at = src.indexOf(marker);
  if (at < 0) return [];
  /* 从 at 往回找最近的 '{'，往前找最近的 '}' */
  const open = src.lastIndexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  const body = src.slice(open, end + 1);
  const sIdx = body.indexOf('subs:');
  if (sIdx < 0) return [];
  const subOpen = body.indexOf('[', sIdx);
  let d2 = 0, subEnd = -1;
  for (let i = subOpen; i < body.length; i++) {
    if (body[i] === '[') d2++;
    else if (body[i] === ']') { d2--; if (d2 === 0) { subEnd = i; break; } }
  }
  if (subEnd < 0) return [];
  const arr = body.slice(subOpen, subEnd + 1);
  const out = [];
  const objRe = /\{\s*at:\s*([\d.]+),\s*dur:\s*([\d.]+),\s*fx:\s*'([^']*)',\s*title:\s*'([^']*)'(?:,\s*sub:\s*'([^']*)')?/g;
  let o;
  while ((o = objRe.exec(arr))) {
    out.push({
      at: parseFloat(o[1]), dur: parseFloat(o[2]), fx: o[3],
      title: o[4], sub: o[5] || ''
    });
  }
  return out;
}

/* 绝对化 */
let acc = 0;
const flat = [];
const chapters = [];
segs.forEach((s, i) => {
  chapters.push({ name: s.chapter, time: +acc.toFixed(2) });
  parseSubsOf(i).forEach(sub => {
    flat.push({
      t: +(acc + sub.at).toFixed(3),
      dur: sub.dur, title: sub.title, sub: sub.sub, fx: sub.fx
    });
  });
  acc += s.dur;
});
const total = acc;

/* SRT */
function srtTime(t) {
  const h = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60), s = Math.floor(t % 60);
  const ms = Math.round((t % 1) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(mm)}:${p(s)},${p(ms, 3)}`;
}
const srt = flat.map((s, i) => {
  const a = srtTime(s.t), b = srtTime(s.t + s.dur);
  const body = s.sub ? `${s.title}\n${s.sub}` : s.title;
  return `${i + 1}\n${a} --> ${b}\n${body}\n`;
}).join('\n');
fs.writeFileSync(path.join(outDir, 'xm-tour.srt'), srt, 'utf8');

/* 纯文字稿 */
const txt = flat.map(s => s.sub ? `${s.title}（${s.sub}）` : s.title).join('\n');
fs.writeFileSync(path.join(outDir, 'xm-tour.txt'), txt + '\n', 'utf8');

/* 章节 JSON */
fs.writeFileSync(path.join(outDir, 'xm-tour-chapters.json'),
  JSON.stringify({ total: +total.toFixed(2), chapters }, null, 2), 'utf8');

/* 播放器用的 JS 片段 */
fs.writeFileSync(path.join(outDir, 'xm-tour-chapters.js'),
  'window.__CHAPTERS=' + JSON.stringify(chapters) + ';', 'utf8');

/* 与成片对表：时间轴和实际视频帧数对不上就直接报出来，
   免得字幕和画面各走各的（之前就踩过段起点累加写错 → 成片黑屏）。 */
{
  const film = path.join(__dirname, '../../tour-remotion/public/all.mp4');
  if (fs.existsSync(film)) {
    const { execFileSync } = require('child_process');
    const n = parseInt(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', film],
      { encoding: 'utf8' }).trim(), 10);
    const filmSec = n / 30;
    if (Math.abs(filmSec - total) > 0.2) {
      console.error(`\n⚠️ 时间轴(${total.toFixed(2)}s) 与成片(${filmSec.toFixed(2)}s / ${n}帧) 对不上，先查 timeline.ts 的 SEG_START！`);
      process.exitCode = 1;
    } else {
      console.log('与成片对表 OK：', filmSec.toFixed(2), '秒 /', n, '帧');
    }
  }
}

console.log('总时长', total.toFixed(2), '秒 /', flat.length, '条字幕 →', outDir);
flat.forEach(s => console.log(`  ${s.t.toFixed(1).padStart(6)}s  ${s.title}`));
