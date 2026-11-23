#!/usr/bin/env python3
# 离线复刻浏览器里的 Web Audio 合成 BGM 调度，逐声源渲染并做频谱体检。
# 目的：不靠肉眼听，量化找出"贯穿全程一直很吵"的到底是哪一层。
import re, wave, subprocess, json, os
import numpy as np

W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
STEP = 0.5

# ---------- 1. 从 HTML 里解析 SONG ----------
html = open(os.path.join(W, 'xiongmeng-art-museum.html'), encoding='utf-8').read()
blk = html.split('SONG:[', 1)[1].split('\n  ],', 1)[0]
blk = re.sub(r'//[^\n]*', '', blk)
rows = re.findall(r'\[\s*(\d+)\s*,\s*([\d.]+)\s*(?:,\s*\[([\d,\s]+)\])?\s*\]', blk)
SONG = [(int(m), float(b), [int(x) for x in c.split(',')] if c.strip() else None) for m, b, c in rows]
print('SONG steps =', len(SONG))

# ---------- 2. 读采样 ----------
def read_wav(p):
    w = wave.open(p); n = w.getnframes(); ch = w.getnchannels(); sr = w.getframerate()
    d = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    if ch == 2: d = d.reshape(-1, 2).mean(1)
    return d, sr

piano, _ = read_wav(os.path.join(W, 'audio/piano.wav'))
harp, _ = read_wav(os.path.join(W, 'audio/harp.wav'))

PIANO_MAP = {67:0, 69:1.7, 71:3.4, 72:5.1, 74:6.8, 76:8.5, 77:10.2, 79:11.9}
PIANO_SEG = 1.7
HARP_SEG = 1.0
HARP_MAP = {48:[0,1],50:[0,1.1225],52:[1,1],53:[1,1.0595],55:[2,1],57:[2,1.1225],
            59:[3,1],60:[3,1.0595],62:[4,1],64:[5,.9439],65:[5,1],66:[5,1.0595],
            67:[5,1.1225],69:[6,1],71:[6,1.1225]}

def hz(m): return 440 * 2 ** ((m - 69) / 12)

# ---------- 3. 渲染器：把一个采样按 rate/dur 叠加到总线上 ----------
def add_sample(bus, buf, off, rate, t, dur, vel):
    i0 = int(round(t * SR))
    n_src = int(round(min(dur, len(buf)/SR - off) * SR))
    if n_src <= 0: return
    # 起始 6ms 淡入（和 playBufSample 一致）
    src = buf[int(round(off*SR)) : int(round(off*SR)) + n_src]
    if len(src) < n_src: src = np.pad(src, (0, n_src - len(src)))
    # playbackRate: 浏览器是重采样，改变时长；这里按线性插值近似
    idx = np.arange(n_src) * rate
    if rate == 1.0:
        out = src
    else:
        pos = np.clip(idx, 0, len(src) - 1)
        out = np.interp(pos, np.arange(len(src)), src)
    fade = int(0.006 * SR)
    env = np.ones(len(out)); env[:fade] = np.linspace(0, 1, fade)
    out = out * env * vel
    end = i0 + len(out)
    if end > len(bus):
        out = out[:len(bus) - i0]; end = len(bus)
    if i0 < len(bus): bus[i0:end] += out

def render(layers, total_s=None):
    if total_s is None:
        total_s = len(SONG) * STEP + 4
    bus = np.zeros(int(total_s * SR), dtype=np.float32)
    for i, (midi, beats, chord) in enumerate(SONG):
        t = 0.18 + i * STEP
        dur = max(.2, beats * STEP)
        if chord and 'harp' in layers and i % 2 == 0:
            for k, c in enumerate(chord):
                e = HARP_MAP.get(c)
                if not e: continue
                add_sample(bus, harp, e[0], e[1], t + k * .072, HARP_SEG / e[1], .10)
        if 'piano' in layers and midi > 0 and midi in PIANO_MAP:
            play_dur = min(PIANO_SEG, max(.20, dur*.62+.24))
            add_sample(bus, piano, PIANO_MAP[midi], 1.0, t, play_dur, .15)
        if 'bell' in layers and i % 8 == 0:
            accent = (i % 16 == 0)
            freqs = [2350, 3050] if accent else [2600]
            amp = .0042 if accent else .0022
            for fr in freqs:
                n = int(.18 * SR); tt = np.arange(n) / SR
                env = np.minimum(1, tt / .012) * np.exp(-tt / .05)
                sig = np.sin(2 * np.pi * fr * tt) * env * amp
                i0 = int(t * SR); bus[i0:i0+n] += sig[:len(bus)-i0]
        if 'bass' in layers and chord:
            f = hz(chord[0] - 12)
            n = int(min(dur, 1.3) * SR); tt = np.arange(n) / SR
            env = np.minimum(1, tt / .025) * np.exp(-tt / .35)
            sig = np.sin(2 * np.pi * f * tt) * env * .095
            i0 = int(t * SR); bus[i0:i0+n] += sig[:len(bus)-i0]
    return bus

# ---------- 4. 体检指标 ----------
def analyse(x, sr=SR):
    rms = float(np.sqrt((x**2).mean()))
    peak = float(np.abs(x).max())
    # 频谱重心 + 高频占比（Welch 近似：分块 FFT）
    win = 4096
    hop = 4096
    frames = x[:len(x)//hop*hop].reshape(-1, hop) * np.hanning(win)
    S = np.abs(np.fft.rfft(frames, axis=1)).mean(0)
    freqs = np.fft.rfftfreq(hop, 1/sr)
    centroid = float((freqs*S).sum() / max(S.sum(), 1e-9))
    band = lambda lo, hi: float(S[(freqs>=lo)&(freqs<hi)].sum()/max(S.sum(),1e-9))
    return dict(rms=round(rms,4), peak=round(peak,3), centroid=round(centroid,1),
                hi4k=round(band(4000, 22050),3), lo200=round(band(0,200),3))

print('\n=== 合成 BGM 分层体检（干声，未含混响/压缩）===')
res = {}
for name, layers in [('钢琴采样', ['piano']), ('竖琴采样', ['harp']), ('雪橇铃', ['bell']),
                     ('贝斯', ['bass']), ('全部合成', ['piano','harp','bell','bass'])]:
    bus = render(layers)
    a = analyse(bus)
    res[name] = a
    print(f"{name:8s} RMS {a['rms']:.4f}  peak {a['peak']:.3f}  重心 {a['centroid']:.0f}Hz  >4k {a['hi4k']*100:.1f}%  <200 {a['lo200']*100:.1f}%")

# ---------- 5. 三条 mp3 垫底 ----------
print('\n=== mp3 垫底（lowpass 4.8k 之后）===')
for mp3, gain in [('museum_piano.mp3', .06), ('park_wonderland.mp3', .05), ('rock_festival.mp3', .06)]:
    src = os.path.join(W, 'audio', mp3)
    raw = subprocess.run(['ffmpeg','-v','quiet','-i',src,'-f','f32le','-ac','1','-ar',str(SR),'-'],
                         capture_output=True).stdout
    d = np.frombuffer(raw, dtype=np.float32)
    # 简易 4.8k 低通（一阶近似足够看量级）
    a_ = 1 - np.exp(-2*np.pi*4800/SR)
    y = np.zeros_like(d); prev_x = 0.0; prev_y = 0.0
    for i in range(len(d)):
        prev_y = prev_x + a_*(d[i]-prev_y); prev_x = d[i]; y[i] = prev_y
    y = y * gain
    a = analyse(y)
    print(f"{mp3:22s} RMS {a['rms']:.4f}  peak {a['peak']:.3f}  重心 {a['centroid']:.0f}Hz  >4k {a['hi4k']*100:.1f}%")

# ---------- 6. 叠在一起看总和 ----------
print('\n=== 合计（合成全部 + 三条 mp3 垫底，各自独立播）===')
bus = render(['piano','harp','bell','bass'])
for mp3, gain in [('museum_piano.mp3', .06), ('park_wonderland.mp3', .05), ('rock_festival.mp3', .06)]:
    src = os.path.join(W, 'audio', mp3)
    raw = subprocess.run(['ffmpeg','-v','quiet','-i',src,'-f','f32le','-ac','1','-ar',str(SR),'-'],
                         capture_output=True).stdout
    d = np.frombuffer(raw, dtype=np.float32) * gain
    n = min(len(bus), len(d)); bus[:n] += d[:n]
a = analyse(bus)
print(f"合计 RMS {a['rms']:.4f}  peak {a['peak']:.3f}  重心 {a['centroid']:.0f}Hz  >4k {a['hi4k']*100:.1f}%")

# ---------- 7. 声源占比（能量贡献）----------
print('\n=== 能量占比 ===')
e = {}
for name, layers in [('钢琴', ['piano']), ('竖琴', ['harp']), ('铃', ['bell']), ('贝斯', ['bass'])]:
    b = render(layers); e[name] = float((b**2).sum())
tot = sum(e.values())
for k, v in e.items():
    print(f"{k}: {v/tot*100:.1f}%  (自身 RMS {np.sqrt(v/len(bus)):.4f})")
