#!/usr/bin/env python3
# 复刻新调度器：主旋律(带颤音) + 竖琴分解琶音 + 贝斯 + 雪橇铃
import os, re, wave
import numpy as np
W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
STEP_DUR = 0.25

html = open(os.path.join(W,'xiongmeng-art-museum.html'), encoding='utf-8').read()

def parse_song():
    blk = html.split('SONG:[',1)[1].split('\n  ],',1)[0]
    blk = re.sub(r'//[^\n]*','',blk)
    rows=[]
    for line in blk.split('\n'):
        for m in re.finditer(r'\[\s*(-?\d+)\s*,\s*([\d.]+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+)\s*)?)?\]', line):
            rows.append((int(m.group(1)), float(m.group(2)),
                         int(m.group(4)) if m.group(4) else 0))
    return rows
SONG = parse_song()

def parse_chords():
    blk = html.split('CHORDS:[',1)[1].split('\n  ],',1)[0]
    out=[]
    for m in re.finditer(r'\[([\d,]+)\]', blk):
        out.append([int(x) for x in m.group(1).split(',')])
    return out
CHORDS = parse_chords()
print('SONG 元素', len(SONG), '→ 小节', len(SONG)/7, ' CHORDS', len(CHORDS))

def read_wav(p):
    w = wave.open(p); n=w.getnframes(); ch=w.getnchannels(); sr=w.getframerate()
    d = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32)/32768
    if ch==2: d = d.reshape(-1,2).mean(1)
    return d, sr

piano, PSR = read_wav(os.path.join(W,'audio/piano.wav'))
harp,  HSR = read_wav(os.path.join(W,'audio/harp.wav'))

PM = {60:0,62:1.5,64:3,65:4.5,66:6,67:7.5,68:9,69:10.5,70:12,71:13.5,
      72:15,73:16.5,74:18,75:19.5,76:21,77:22.5,78:24,79:25.5,81:27,83:28.5,84:30}
PSEG = 1.5
HM = {38:[0,1],39:[0,1.0595],40:[0.7,0.9439],41:[0.7,1],42:[0.7,1.0595],
      43:[1.3999,0.8909],44:[1.3999,0.9439],45:[1.3999,1],46:[1.3999,1.0595],
      47:[2.0999,0.9439],48:[2.0999,1],49:[2.0999,1.0595],50:[2.7998,0.8909],
      51:[2.7998,0.9439],52:[2.7998,1],53:[2.7998,1.0595],54:[3.4998,0.9439],
      55:[3.4998,1],56:[3.4998,1.0595],57:[4.1997,0.8909],58:[4.1997,0.9439],
      59:[4.1997,1],60:[4.1997,1.0595],61:[4.8997,0.9439],62:[4.8997,1],
      63:[4.8997,1.0595],64:[5.5996,0.9439],65:[5.5996,1],66:[5.5996,1.0595],
      67:[6.2996,0.8909],68:[6.2996,0.9439],69:[6.2996,1],70:[6.2996,1.0595],
      71:[6.9995,0.9439],72:[6.9995,1],73:[6.9995,1.0595],74:[7.6995,0.8909],
      75:[7.6995,0.9439],76:[7.6995,1],77:[7.6995,1.0595],78:[8.3995,0.9439],
      79:[8.3995,1],80:[8.3995,1.0595],81:[9.0994,0.8909],82:[9.0994,0.9439],
      83:[9.0994,1],84:[9.0994,1.0594]}

def add_sample(bus, buf, bufSR, off, rate, t, dur, vel):
    i0 = int(round(t*SR)); ns = int(round(min(dur, len(buf)/bufSR-off)*SR))
    if ns <= 0: return
    src = buf[int(round(off*bufSR)):int(round(off*bufSR))+ns]
    if len(src) < ns: src = np.pad(src,(0,ns-len(src)))
    if abs(rate-1.0) > 1e-6:
        pos = np.clip(np.arange(ns)*rate, 0, len(src)-1)
        src = np.interp(pos, np.arange(len(src)), src)
    env = np.ones(len(src))
    f = int(0.006*SR); env[:f] = np.linspace(0,1,f)
    if len(src) > int(0.045*SR):
        n = int(0.025*SR); env[-n:] = np.linspace(1,0,n)
    out = src*env*vel
    e = i0+len(out)
    if e > len(bus): out = out[:len(bus)-i0]; e = len(bus)
    if i0 < len(bus): bus[i0:e] += out

def hz(m): return 440*2**((m-69)/12)

def render(layers, total_s=35):
    bus = np.zeros(int(total_s*SR), dtype=np.float32)
    beatAcc = 0
    for i,(midi,beats,trill) in enumerate(SONG):
        t = 0.18 + sum(r[1] for r in SONG[:i])*STEP_DUR
        dur = max(.12, beats*STEP_DUR)
        if 'piano' in layers and midi > 0:
            if trill:
                step = .062; n = max(2, round(dur/step))
                for k in range(n):
                    m = midi+1 if k%2 else midi
                    add_sample(bus, piano, PSR, PM[m], 1.0, t+k*step, .09, .11*(.60 if k%2 else 1.0))
            else:
                playDur = min(PSEG, dur + min(.30, dur*.9))
                add_sample(bus, piano, PSR, PM[midi], 1.0, t, playDur, .13)
        if beatAcc == 0:
            chord = CHORDS[(i//7) % len(CHORDS)]
            if 'harp' in layers:
                top = chord[-1]
                notes = [chord[0], chord[1], top, top+12]
                for k,n in enumerate(notes):
                    e = HM.get(n)
                    if e: add_sample(bus, harp, HSR, e[0], e[1], t+k*.25, .45, .07)
            if 'bass' in layers:
                f = hz(chord[0]-12); n = int(1.05*SR); tt = np.arange(n)/SR
                env = np.minimum(1, tt/.025)*np.exp(-tt/.35)
                sig = np.sin(2*np.pi*f*tt)*env*.075
                i0 = int(t*SR); bus[i0:i0+n] += sig[:max(0,len(bus)-i0)]
        beatAcc += beats
        if beatAcc >= 8:
            beatAcc -= 8
            if 'bell' in layers:
                freqs = [2350,3050] if beatAcc==0 else [2600]
                amp = .0042 if beatAcc==0 else .0022
                for fr in freqs:
                    n = int(.18*SR); tt = np.arange(n)/SR
                    env = np.minimum(1, tt/.012)*np.exp(-tt/.05)
                    sig = np.sin(2*np.pi*fr*tt)*env*amp
                    i0 = int(t*SR); bus[i0:i0+n] += sig[:max(0,len(bus)-i0)]
    return bus

def analyse(x):
    rms = float(np.sqrt((x**2).mean())); peak = float(np.abs(x).max())
    win=8192; hop=8192
    fr = x[:len(x)//hop*hop].reshape(-1,hop)
    S = np.abs(np.fft.rfft(fr*np.hanning(win),axis=1)).mean(0)
    fq = np.fft.rfftfreq(hop,1/SR)
    band = lambda lo,hi: float(S[(fq>=lo)&(fq<hi)].sum()/max(S.sum(),1e-9))
    return dict(rms=rms, peak=peak, cen=float((fq*S).sum()/max(S.sum(),1e-9)),
                hi4k=band(4000,22050), lo=band(0,200), mid=band(200,4000))

print('\n=== 分层 ===')
res={}
for name,lay in [('钢琴',['piano']),('竖琴',['harp']),('贝斯',['bass']),('铃',['bell']),
                 ('全部',['piano','harp','bass','bell'])]:
    b = render(lay); a = analyse(b); res[name]=b
    print(f"{name:4s} RMS {a['rms']:.4f} peak {a['peak']:.3f} 重心 {a['cen']:.0f}Hz >4k {a['hi4k']*100:.1f}% <200 {a['lo']*100:.1f}%")

tot = sum(float((res[k]**2).sum()) for k in ['钢琴','竖琴','铃','贝斯'])
print('\n=== 能量占比 ===')
for k in ['钢琴','竖琴','铃','贝斯']:
    e = float((res[k]**2).sum())
    print(f"{k}: {e/tot*100:.1f}%")

b = res['全部']
env = np.array([np.sqrt((b[i*SR//4:(i+1)*SR//4]**2).mean()) for i in range(len(b)//(SR//4))])
print('\n=== 全部层能量包络（每 0.25s）===')
print(' '.join('%.3f'%v for v in env[:120]))

print('\n=== 与旧版对比 ===')
print('旧版全部合成 RMS 0.0459 / peak 0.285 / 能量占比 钢琴50.4% 竖琴34.9% 贝斯14.8%')
a = analyse(b)
print(f"新版全部     RMS {a['rms']:.4f} / peak {a['peak']:.3f} / 重心 {a['cen']:.0f}Hz >4k {a['hi4k']*100:.1f}%")
