/* 时间轴数据
   ─────────────────────────────────────────────────────────
   段结构（11 段，与 tools/xm-studio/tour_plan.js 一一对应）：
     dur   该段实拍素材时长（秒）
     src   素材文件名（public/ 下）
     sub   该段里的字幕（相对该段起点）
     sfx   该段里的动效音效（相对该段起点）
   转场：段与段之间用白闪 + 交叉溶解盖住硬切。

   素材时长必须与实拍一致 —— 录制完用 `node tools/xm-studio/probe_durations.js`
   校准这里，或直接跑 build_timeline.js 自动生成本文件。
*/

export type Sub = {
  at: number;        // 相对段起点（秒）
  dur: number;       // 持续（秒）
  fx: 'card' | 'lower' | 'pop' | 'type';
  title: string;
  sub?: string;
  accent?: string;
};

export type Seg = {
  id: string;
  src: string;
  dur: number;
  chapter: string;
  subs?: Sub[];
  sfx?: { name: string; at: number; vol?: number }[];
  /** 白闪强度，0 表示这一段进来时不做白闪 */
  flash?: number;
};

export const SEGMENTS: Seg[] = [
  {
    id: 'gate', src: 'seg-01.mp4', dur: 9.867, chapter: '开场 · 艺术馆正门',
    flash: .55,
    subs: [{ at: .9, dur: 7.0, fx: 'card', title: '熊萌艺术馆', sub: '圣诞冰雪特展 · 夜场', accent: '#ffd089' }],
    sfx: [{ name: 'whoosh', at: 0, vol: .9 }],
  },
  {
    id: 'glass', src: 'seg-02.mp4', dur: 8.767, chapter: '玻璃幕墙 · 暖金灯带',
    subs: [{ at: 2.4, dur: 6.0, fx: 'card', title: '玻璃幕墙 · 暖金灯带', sub: '雪落进暖光里', accent: '#ffd089' }],
  },
  {
    id: 'fountain', src: 'seg-03.mp4', dur: 11.833, chapter: '八角冰雕喷泉',
    subs: [{ at: 2.6, dur: 7.2, fx: 'card', title: '八角冰雕喷泉', sub: '八道水弧 · 雪花石柱 · 圣诞小熊', accent: '#7fe3ff' }],
    sfx: [{ name: 'water', at: .5, vol: .5 }],
  },
  {
    id: 'market', src: 'seg-04.mp4', dur: 7.9, chapter: '圣诞市集',
    subs: [{ at: 1.2, dur: 5.2, fx: 'lower', title: '圣诞市集', sub: '灯串 · 木柜台 · 棉花糖' }],
    sfx: [{ name: 'bell', at: 0, vol: .8 }],
  },
  {
    id: 'tree', src: 'seg-05.mp4', dur: 7.833, chapter: '皇家星耀巨树',
    subs: [{ at: 1.2, dur: 5.4, fx: 'card', title: '皇家星耀巨树', sub: '驯鹿雪园 · 金色流萤', accent: '#ffd089' }],
  },
  {
    id: 'wheel-ext', src: 'seg-06.mp4', dur: 3.833, chapter: '摩天轮 · 巨轮升起',
    subs: [{ at: .4, dur: 3.2, fx: 'card', title: '雪夜里的巨轮', sub: '整只轮子转起来', accent: '#ffd089' }],
    sfx: [{ name: 'bell', at: 0, vol: .7 }],
  },
  {
    id: 'wheel-ride', src: 'seg-07.mp4', dur: 13.9, chapter: '摩天轮 · 第一视角',
    flash: .85,
    subs: [{ at: .8, dur: 5.0, fx: 'card', title: '坐上摩天轮', sub: '第一视角升空，俯瞰整座雪城', accent: '#ffd089' }],
    sfx: [{ name: 'whoosh', at: 0, vol: .8 }, { name: 'wind', at: .4, vol: .45 }],
  },
  {
    id: 'coaster', src: 'seg-08.mp4', dur: 12.967, chapter: '云霄飞车 · 第一视角',
    flash: .85,
    subs: [{ at: .8, dur: 5.6, fx: 'card', title: '云霄飞车', sub: '贴地俯冲，把雪城甩在身后', accent: '#ff9a6b' }],
    sfx: [{ name: 'whoosh', at: 0, vol: .8 }, { name: 'rumble', at: .4, vol: .5 }],
  },
  {
    id: 'nest', src: 'seg-09.mp4', dur: 8.967, chapter: '国家体育场「鸟巢」',
    subs: [{ at: 1.0, dur: 5.6, fx: 'card', title: '国家体育场「鸟巢」', sub: '24 根伞骨 · 编织钢壳', accent: '#9fd8ff' }],
  },
  {
    id: 'church', src: 'seg-10.mp4', dur: 8.733, chapter: '哥特大教堂',
    subs: [{ at: 1.0, dur: 5.6, fx: 'card', title: '哥特大教堂', sub: '玫瑰窗 · 尖拱门', accent: '#ffd089' }],
  },
  {
    id: 'finale', src: 'seg-11.mp4', dur: 14.8, chapter: '全景收尾',
    subs: [{ at: 2.0, dur: 9.0, fx: 'pop', title: '这一场雪，属于所有人', sub: '熊萌艺术馆 · 圣诞冰雪特展', accent: '#ffd089' }],
    sfx: [{ name: 'chord', at: 1.6, vol: .9 }],
  },
];

/* 段起点（帧）
   ⚠️ 这里必须逐段累加「上一段的帧数」。
   之前写成 acc[last] + 当前段帧数，会在段与段之间留出空洞，
   那些帧没有任何 Sequence 覆盖 → 成片直接黑屏（实测 47~55 秒）。 */
export const FPS = 30;
export const SEG_FRAMES = SEGMENTS.map(s => Math.round(s.dur * FPS));
export const SEG_START: number[] = [];
{
  let acc = 0;
  for (const f of SEG_FRAMES) { SEG_START.push(acc); acc += f; }
}
export const TOTAL_FRAMES = SEG_FRAMES.reduce((a, b) => a + b, 0);

/* 成片比素材总帧数少 1 帧：
   Remotion 服务端抽帧时 currentTime = 0 一定抽出黑帧，
   所以画面层用 trimBefore={1}，整片从素材的第 1 帧开始播。 */
export const FILM_FRAMES = TOTAL_FRAMES - 1;

/* 章节表（给播放器网页用） */
export const CHAPTERS = SEGMENTS.map((s, i) => ({
  name: s.chapter,
  time: +(SEG_START[i] / FPS).toFixed(2),
}));
