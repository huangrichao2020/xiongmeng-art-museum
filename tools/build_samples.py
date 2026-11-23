#!/usr/bin/env python3
# 把 Salamander 采样拼成多音高单文件 wav，并输出 PIANO_MAP / HARP_MAP
import os, subprocess, wave
import numpy as np

SR = 22050  # 存 22.05kHz 省一半体积，浏览器解码时会自动重采样到设备采样率
PI = [  # (midi, Salamander 文件名)
 (60,'C4'),(62,'D4'),(64,'E4'),(65,'F4'),(66,'Fs4'),(67,'G4'),(68,'Gs4'),
 (69,'A4'),(70,'As4'),(71,'B4'),(72,'C5'),(73,'Cs5'),(74,'D5'),(75,'Ds5'),
 (76,'E5'),(77,'F5'),(78,'Fs5'),(79,'G5'),(81,'A5'),(83,'B5'),(84,'C6')]
HI = [  # 竖琴
 (38,'D2'),(41,'F2'),(45,'A2'),(48,'C3'),(52,'E3'),(55,'G3'),(59,'B3'),
 (62,'D4'),(65,'F4'),(69,'A4'),(72,'C5'),(76,'E5'),(79,'G5'),(83,'B5'),(86,'D6')]

def load_mp3(path):
    raw = subprocess.run(['ffmpeg','-v','quiet','-i',path,'-f','f32le','-ac','1','-ar',str(SR),'-'],
                         capture_output=True).stdout
    if not raw: raise RuntimeError('decode fail '+path)
    return np.frombuffer(raw, dtype=np.float32).copy()

def trim_head(x, rel=0.03):
    """掐掉采样开头的静音"""
    peak = np.abs(x).max()
    if peak < 1e-6: return x
    thr = max(peak*rel, 1e-4)
    idx = np.argmax(np.abs(x) > thr)
    return x[idx:]

def build(items, seg, tail, out, sr=SR):
    chunks = []
    for midi, name in items:
        x = load_mp3(os.path.join('/tmp/smp', items is PI and 'piano' or 'harp', name+'.mp3'))
        x = trim_head(x)
        n = int(seg*sr)
        if len(x) > n: x = x[:n]
        else: x = np.pad(x, (0, n-len(x)))
        # 尾部淡出
        f = min(int(tail*sr), len(x))
        if f > 1: x[-f:] *= np.linspace(1, 0, f)
        pk = np.abs(x).max()
        if pk > 1e-6: x = x * (0.9/pk)
        chunks.append((midi, x))
    total = sum(len(c[1]) for c in chunks)
    buf = np.zeros(total, dtype=np.float32)
    out_map = {}
    pos = 0
    for midi, x in chunks:
        buf[pos:pos+len(x)] = x
        out_map[midi] = pos/sr
        pos += len(x)
    with wave.open(out, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(buf,-1,1)*32767).astype('<i2').tobytes())
    return out_map

pmap = build(PI, 1.5, 0.28, '/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace/audio/piano.wav')
hmap = build(HI, 0.7, 0.20, '/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace/audio/harp.wav')

print('PIANO_MAP:{')
print(','.join('%d:%.4f' % (m, o) for m, o in sorted(pmap.items())))
print('}  seg=1.5')
print('PIANO_SEG:1.5')
print()
print('harp offsets (midi:offset):')
print(','.join('%d:%.4f' % (m, o) for m, o in sorted(hmap.items())))
print('harp seg 0.7')
for f in ['piano.wav','harp.wav']:
    p=os.path.join('/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace/audio',f)
    w=wave.open(p); print(f, os.path.getsize(p),'bytes', round(w.getnframes()/w.getframerate(),2),'s')
