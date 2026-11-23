#!/usr/bin/env python3
# 第二轮诊断：找出"贯穿全程"的恒定层
import os, subprocess, wave, re
import numpy as np
W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
import importlib.util
spec = importlib.util.spec_from_file_location('rb', os.path.join(W, 'tools/render_bgm.py'))

def read_wav(p):
    w = wave.open(p); n = w.getnframes(); ch = w.getnchannels()
    d = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32)/32768
    if ch == 2: d = d.reshape(-1,2).mean(1)
    return d

html = open(os.path.join(W,'xiongmeng-art-museum.html'), encoding='utf-8').read()
blk = html.split('SONG:[',1)[1].split('\n  ],',1)[0]
blk = re.sub(r'//[^\n]*','',blk)
rows = re.findall(r'\[\s*(\d+)\s*,\s*([\d.]+)\s*(?:,\s*\[([\d,\s]+)\])?\s*\]', blk)
SONG=[(int(m),float(b),[int(x) for x in c.split(',')] if c.strip() else None) for m,b,c in rows]

piano = read_wav(os.path.join(W,'audio/piano.wav'))
harp  = read_wav(os.path.join(W,'audio/harp.wav'))
PM={67:0,69:1.7,71:3.4,72:5.1,74:6.8,76:8.5,77:10.2,79:11.9}
HM={48:[0,1],50:[0,1.1225],52:[1,1],53:[1,1.0595],55:[2,1],57:[2,1.1225],
    59:[3,1],60:[3,1.0595],62:[4,1],64:[5,.9439],65:[5,1],66:[5,1.0595],
    67:[5,1.1225],69:[6,1],71:[6,1.1225]}

def add(bus,buf,off,rate,t,dur,vel):
    i0=int(round(t*SR)); ns=int(round(min(dur,len(buf)/SR-off)*SR))
    if ns<=0: return
    src=buf[int(round(off*SR)):int(round(off*SR))+ns]
    if len(src)<ns: src=np.pad(src,(0,ns-len(src)))
    if rate!=1.0:
        pos=np.clip(np.arange(ns)*rate,0,len(src)-1)
        src=np.interp(pos,np.arange(len(src)),src)
    f=int(.006*SR); env=np.ones(len(src)); env[:f]=np.linspace(0,1,f)
    if len(src)>int(.045*SR):
        n=int(.025*SR); env[-n:]=np.linspace(1,0,n)
    out=src*env*vel; e=i0+len(out)
    if e>len(bus): out=out[:len(bus)-i0]; e=len(bus)
    if i0<len(bus): bus[i0:e]+=out

def render(layers, total_s=55):
    bus=np.zeros(int(total_s*SR),dtype=np.float32)
    for i,(midi,beats,chord) in enumerate(SONG):
        t=.18+i*.5; dur=max(.2,beats*.5)
        if chord and 'harp' in layers and i%2==0:
            for k,c in enumerate(chord):
                e=HM.get(c)
                if e: add(bus,harp,e[0],e[1],t+k*.072,1.0/e[1],.10)
        if 'piano' in layers and midi>0 and midi in PM:
            pd=min(1.7,max(.20,dur*.62+.24))
            add(bus,piano,PM[midi],1.0,t,pd,.15)
    return bus

def env_track(x, hop=SR//4):
    n=len(x)//hop
    return np.array([np.sqrt((x[i*hop:(i+1)*hop]**2).mean()) for i in range(n)])

print('=== 同时发声的钢琴音数量（每 0.25s 统计仍在发声的音头）===')
bus_p = render(['piano'])
# 逐 0.5s 步统计重叠
step=.5
print('步  时间   该步音的起点  该音实际结束(1.7s)')
for i in range(0,16):
    midi,beats,chord = SONG[i]
    t=.18+i*step
    if midi>0 and midi in PM:
        print(f'{i:2d}  {t:5.2f}s  midi {midi}   -> 结束 {t+1.7:5.2f}s  (下一步 {t+step:.2f}s)')

print('\n=== 分层能量占比（干声）===')
bp = render(['piano']); bh = render(['harp'])
print('钢琴 RMS %.4f / 竖琴 RMS %.4f' % (np.sqrt((bp**2).mean()), np.sqrt((bh**2).mean())))

print('\n=== 钢琴层按时间窗口的能量（看是否恒定不间断）===')
e = env_track(bp)
print(' '.join('%.3f' % v for v in e[:80]))

print('\n=== 竖琴层按时间窗口的能量 ===')
e2 = env_track(bh)
print(' '.join('%.3f' % v for v in e2[:80]))

print('\n=== 钢琴层频谱（分段平均，找持续高频）===')
X = np.abs(np.fft.rfft(bp[:len(bp)//8192*8192].reshape(-1,8192)*np.hanning(8192),axis=1)).mean(0)
f = np.fft.rfftfreq(8192,1/SR)
for lo,hi in [(0,200),(200,500),(500,1000),(1000,2000),(2000,4000),(4000,8000),(8000,22050)]:
    m=(f>=lo)&(f<hi)
    print(f'  {lo:5d}-{hi:5d}Hz  {X[m].sum()/X.sum()*100:5.1f}%')

print('\n=== 三条 mp3 原始频谱 + loop 点 ===')
for mp3 in ['museum_piano.mp3','park_wonderland.mp3','rock_festival.mp3']:
    raw=subprocess.run(['ffmpeg','-v','quiet','-i',os.path.join(W,'audio',mp3),'-f','f32le','-ac','1','-ar',str(SR),'-'],capture_output=True).stdout
    d=np.frombuffer(raw,dtype=np.float32)
    X=np.abs(np.fft.rfft(d[:len(d)//8192*8192].reshape(-1,8192)*np.hanning(8192),axis=1)).mean(0)
    fq=np.fft.rfftfreq(8192,1/SR)
    hi=X[(fq>=4000)].sum()/X.sum()*100
    # 开头/结尾能量差（loop 突变）
    print(f'{mp3:22s} dur {len(d)/SR:5.1f}s  >4k {hi:5.1f}%  首0.2s RMS {np.sqrt((d[:8820]**2).mean()):.4f}  尾0.2s RMS {np.sqrt((d[-8820:]**2).mean()):.4f}')
