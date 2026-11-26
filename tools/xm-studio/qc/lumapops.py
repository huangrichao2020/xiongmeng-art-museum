# 逐帧平均亮度跳变 + “跳一下又回来”的 pop 检测
# (a) 相邻帧平均亮度跳变 >= 8
# (b) pop：跳变 >= 10 且在 12 帧内回到原位的 35% 以内
# 用法： python3 lumapops.py 视频.mp4 [fps] [t0 t1]
import subprocess, sys, numpy as np
f = sys.argv[1]; W, H = 160, 90; fps = float(sys.argv[2]) if len(sys.argv)>2 else 60.0
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', f, '-vf', f'scale={W}:{H}:flags=area', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True).stdout
a = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32); m = a.mean(axis=(1, 2)); n = len(m)
if len(sys.argv) > 3:
    t0, t1 = float(sys.argv[2]), float(sys.argv[3])
    print('per-frame mean luma %.2f-%.2f s:' % (t0, t1)); print(' '.join('%.2f:%.1f' % (i / fps, m[i]) for i in range(int(t0 * fps), min(n, int(t1 * fps) + 1))))
d = np.diff(m)
print('\nframe-to-frame jumps >= 8:'); print(' '.join('%.3f:%+.1f(%.0f->%.0f)' % ((i + 1) / fps, d[i], m[i], m[i + 1]) for i in np.where(np.abs(d) >= 8)[0]))
print('\npops (excursion >= 10 that returns within 12 frames):')
pops = []
for i in range(n - 2):
    base = m[i]
    for L in range(2, 13):
        if i + L >= n: break
        seg = m[i + 1:i + L]; ex = seg.max() - base if abs(seg.max() - base) > abs(seg.min() - base) else seg.min() - base
        if abs(ex) >= 10 and abs(m[i + L] - base) <= .35 * abs(ex) and abs(m[i + 1] - base) >= .5 * abs(ex):
            pops.append((i + 1, L - 1, ex, base)); break
last = -99
for s, L, ex, base in pops:
    if s - last > 3: print('  %.3f s  %d frames  %+.1f from %.1f' % (s / fps, L, ex, base))
    last = s
print('frames', n)
