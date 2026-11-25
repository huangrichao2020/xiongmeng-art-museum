/* 生成宣传片用的动效音效（WAV, 44.1kHz 单声道 16bit）
   合成参数与页面内 tour_recorder.js 的 makeSfx 保持一致，
   这样 Remotion 里叠的音效和旧版直接烧进画面的听感是同一套。

   用法： node make_sfx.js <输出目录> */
const fs = require('fs'), path = require('path');
const SR = 44100;

function buf(dur) { return new Float32Array(Math.floor(SR * dur)); }

/* 一阶低通 */
function lp(data, cutoff) {
  const a = Math.exp(-2 * Math.PI * cutoff / SR);
  let y = 0;
  for (let i = 0; i < data.length; i++) { y = (1 - a) * data[i] + a * y; data[i] = y; }
  return data;
}
/* 一阶高通 */
function hp(data, cutoff) {
  const a = Math.exp(-2 * Math.PI * cutoff / SR);
  let y = 0, px = 0;
  for (let i = 0; i < data.length; i++) { y = a * (y + data[i] - px); px = data[i]; data[i] = y; }
  return data;
}
/* 状态变量带通（能扫频） */
function bpf(data, cutoffs, q) {
  const out = new Float32Array(data.length);
  let low = 0, band = 0;
  for (let i = 0; i < data.length; i++) {
    const fc = cutoffs[Math.min(cutoffs.length - 1, Math.floor(i / data.length * cutoffs.length))];
    const f = 2 * Math.sin(Math.PI * fc / SR);
    const qq = 1 / q;
    const hpv = data[i] - low - qq * band;
    band += f * hpv;
    low += f * band;
    out[i] = band;
  }
  return out;
}

function noise(dur, seed) {
  const d = buf(dur);
  let s = seed || 12345;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (s / 0x3fffffff) - 1;
  }
  return d;
}

function envAD(t, dur, a, d, peak) {
  if (t < a) return peak * (t / a);
  if (t > a + d) return 0;
  return peak * Math.exp(-(t - a) / (d * .35));
}
function envSustain(t, dur, a, rel, level) {
  if (t < a) return level * (t / a);
  if (t > dur - rel) return level * Math.max(0, (dur - t) / rel);
  return level;
}

function addOsc(out, { type = 'sine', f0, f1, t0 = 0, dur, attack = .01, decay = .3, peak = .3, curve = 'exp' }) {
  const n = Math.floor(dur * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = t / dur;
    const f = curve === 'exp' ? f0 * Math.pow(f1 / f0, u) : f0 + (f1 - f0) * u;
    ph += 2 * Math.PI * f / SR;
    let v;
    if (type === 'sine') v = Math.sin(ph);
    else if (type === 'triangle') v = 2 / Math.PI * Math.asin(Math.sin(ph));
    else if (type === 'saw') v = 2 * (ph / (2 * Math.PI) % 1) - 1;
    else v = Math.sin(ph);
    const idx = Math.floor(t0 * SR) + i;
    if (idx < out.length) out[idx] += v * envAD(t, dur, attack, decay, peak);
  }
}

function writeWav(file, data) {
  const n = data.length;
  const bufw = Buffer.alloc(44 + n * 2);
  bufw.write('RIFF', 0); bufw.writeUInt32LE(36 + n * 2, 4); bufw.write('WAVE', 8);
  bufw.write('fmt ', 12); bufw.writeUInt32LE(16, 16); bufw.writeUInt16LE(1, 20);
  bufw.writeUInt16LE(1, 22); bufw.writeUInt32LE(SR, 24); bufw.writeUInt32LE(SR * 2, 28);
  bufw.writeUInt16LE(2, 32); bufw.writeUInt16LE(16, 34);
  bufw.write('data', 36); bufw.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, data[i]));
    bufw.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, bufw);
  return bufw.length;
}

/* ── 各音效 ───────────────────────────────────────── */
const makers = {
  /* 掠过风声：带通扫频 + 低频闷响 */
  whoosh() {
    const dur = 1.15, d = buf(dur);
    const nz = noise(dur, 777);
    const band = bpf(nz, [320, 900, 2000, 3400, 4200, 3600, 1800, 700, 260], 1.4);
    for (let i = 0; i < d.length; i++) {
      const t = i / SR, u = t / dur;
      const amp = u < .08 ? u / .08 : Math.exp(-(u - .08) / .40);
      d[i] = band[i] * amp * .9;
    }
    const o = buf(dur);
    addOsc(o, { type: 'sine', f0: 120, f1: 42, dur: .7, attack: .01, decay: .55, peak: .48 });
    for (let i = 0; i < d.length; i++) d[i] += o[i];
    return d;
  },
  /* 气泡小音 */
  pop() {
    const dur = .25, d = buf(dur);
    addOsc(d, { type: 'triangle', f0: 760, f1: 1180, dur: .25, attack: .006, decay: .16, peak: .34 });
    return d;
  },
  /* 铃铛：三个泛音 */
  bell(base = 880) {
    const dur = 1.7, d = buf(dur);
    [1, 2.01, 3.02].forEach((m, i) => {
      addOsc(d, {
        type: 'sine', f0: base * m, f1: base * m, dur: 1.7 - i * .35,
        attack: .005, decay: 1.5 - i * .35, peak: .28 / (i + 1)
      });
    });
    return d;
  },
  /* 流水：带通噪声 + 缓慢摆动 */
  water(dur = 6) {
    const d = buf(dur);
    const nz = noise(dur, 4242);
    const band = bpf(nz, [1500], .7);
    for (let i = 0; i < d.length; i++) {
      const t = i / SR;
      const mod = 1 + .38 * Math.sin(2 * Math.PI * .6 * t);
      d[i] = band[i] * mod * envSustain(t, dur, .7, .8, .30);
    }
    return d;
  },
  /* 风：低通噪声，滤波频率先升后降 */
  wind(dur = 6) {
    const nz = noise(dur, 9090);
    const out = buf(dur);
    let y = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR, u = t / dur;
      const fc = u < .6 ? 400 + (1500 - 400) * (u / .6) : 1500 + (500 - 1500) * ((u - .6) / .4);
      const a = Math.exp(-2 * Math.PI * fc / SR);
      y = (1 - a) * nz[i] + a * y;
      out[i] = y * envSustain(t, dur, 1.0, 1.0, .40);
    }
    return out;
  },
  /* 低频轰鸣：重低通噪声 + 上扫锯齿 */
  rumble(dur = 6) {
    const d = buf(dur);
    const nz = noise(dur, 5150);
    const low = lp(nz, 170);
    for (let i = 0; i < d.length; i++) {
      const t = i / SR;
      d[i] = low[i] * envSustain(t, dur, .5, .5, .85);
    }
    const o = buf(dur);
    addOsc(o, { type: 'saw', f0: 110, f1: 520, dur: dur * .7, attack: dur * .5, decay: .6, peak: .05 });
    for (let i = 0; i < d.length; i++) d[i] += o[i];
    return d;
  },
  /* 收尾和弦 */
  chord() {
    const dur = 4.2, d = buf(dur);
    [0, 4, 7, 12, 16].forEach((semi, i) => {
      const f = 261.63 * Math.pow(2, semi / 12);
      addOsc(d, { type: 'triangle', f0: f, f1: f, dur: 3.2, attack: .05, decay: 3.2, peak: .16, t0: i * .06 });
    });
    const b = makers.bell(1046.5);
    for (let i = 0; i < b.length && i + Math.floor(.1 * SR) < d.length; i++)
      d[Math.floor(.1 * SR) + i] += b[i] * .8;
    return d;
  },
  /* 雪落沙沙（低强度环境层） */
  snow(dur = 8) {
    const d = buf(dur);
    const nz = noise(dur, 3131);
    const band = bpf(nz, [4200, 5200, 6400], 1.2);
    for (let i = 0; i < d.length; i++) {
      const t = i / SR;
      d[i] = band[i] * envSustain(t, dur, 1.2, 1.2, .10);
    }
    return d;
  }
};

const outDir = process.argv[2] || '/tmp/xm-sfx';
fs.mkdirSync(outDir, { recursive: true });
const jobs = [
  ['whoosh.wav', () => makers.whoosh()],
  ['pop.wav', () => makers.pop()],
  ['bell.wav', () => makers.bell(880)],
  ['bell-high.wav', () => makers.bell(1046.5)],
  ['water.wav', () => makers.water(6)],
  ['wind.wav', () => makers.wind(6)],
  ['rumble.wav', () => makers.rumble(6)],
  ['chord.wav', () => makers.chord()],
  ['snow.wav', () => makers.snow(8)],
];
for (const [name, fn] of jobs) {
  const d = fn();
  /* 峰值归一到 0.85 */
  let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) { const g = .85 / pk; for (let i = 0; i < d.length; i++) d[i] *= g; }
  const size = writeWav(path.join(outDir, name), d);
  console.log(name, (size / 1024).toFixed(0) + 'KB', (d.length / SR).toFixed(2) + 's');
}
console.log('输出目录:', outDir);
