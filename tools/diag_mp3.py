#!/usr/bin/env python3
# 第三轮：分析三条 mp3 的高频层是否"贯穿全程恒定"，以及 loop 接缝突变
import os, subprocess
import numpy as np
W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100

def decode(p):
    raw = subprocess.run(['ffmpeg','-v','quiet','-i',p,'-f','f32le','-ac','1','-ar',str(SR),'-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def band_energy(x, lo, hi, hop=4096):
    win = 8192
    n = len(x)//hop*hop
    frames = x[:n].reshape(-1, hop)
    win_ = np.hanning(win)
    out = []
    for f in frames:
        pad = np.zeros(win); pad[:hop] = f
        S = np.abs(np.fft.rfft(pad*win_))
        freqs = np.fft.rfftfreq(win, 1/SR)
        m = (freqs>=lo)&(freqs<hi)
        out.append(S[m].sum())
    return np.array(out)

for mp3 in ['museum_piano.mp3','park_wonderland.mp3','rock_festival.mp3']:
    d = decode(os.path.join(W,'audio',mp3))
    hi = band_energy(d, 4000, 16000)
    mid = band_energy(d, 800, 3000)
    hi_n = hi/max(hi.max(),1e-9)
    print(f'--- {mp3}  ({len(d)/SR:.1f}s) ---')
    print('  4k-16k 分段能量(归一): ' + ' '.join('%.2f'%v for v in hi_n[:24]))
    print('  中频对比(归一)      : ' + ' '.join('%.2f'%v for v in (mid/max(mid.max(),1e-9))[:24]))
    # loop 接缝
    head = d[:int(.3*SR)]; tail = d[-int(.3*SR):]
    print('  首0.3s RMS %.4f / 尾0.3s RMS %.4f  -> 接缝落差 %.1f dB' % (
        np.sqrt((head**2).mean()), np.sqrt((tail**2).mean()),
        20*np.log10((np.sqrt((head**2).mean())+1e-9)/(np.sqrt((tail**2).mean())+1e-9))))
    # 高频是否全程有
    print('  高频全程占比(有能量的段落) %d/%d' % ((hi_n>0.15).sum(), len(hi_n)))
