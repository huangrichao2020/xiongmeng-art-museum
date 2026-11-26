# 闪白检测（WCAG 2.3.1 风格）：整帧 + 四个 25% 象限各算一次
# 一次闪光 = 相对亮度出现 >=0.10 的反向跳变，且较暗一侧 < 0.80
# 判定：任意 1 秒窗口内闪光数 <= 3 为 PASS
# 用法： python3 flashcheck.py 视频.mp4 [fps]
import subprocess, sys, numpy as np
f = sys.argv[1]; W, H = 160, 90
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', f, '-vf', f'scale={W}:{H}:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
a = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32) / 255; fps = float(sys.argv[2]) if len(sys.argv)>2 else 60.0
lin = np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4); Y = lin[..., 0] * .2126 + lin[..., 1] * .7152 + lin[..., 2] * .0722
regions = {'full': Y.mean(axis=(1, 2))}
for i, (ys, xs) in enumerate([(slice(0, H // 2), slice(0, W // 2)), (slice(0, H // 2), slice(W // 2, W)), (slice(H // 2, H), slice(0, W // 2)), (slice(H // 2, H), slice(W // 2, W))]): regions['q%d' % i] = Y[:, ys, xs].mean(axis=(1, 2))
def transitions(s):
    out = []; i = 0; n = len(s)
    while i < n - 1:
        j = i; d = np.sign(s[i + 1] - s[i])
        if d == 0: i += 1; continue
        while j < n - 1 and np.sign(s[j + 1] - s[j]) in (d, 0): j += 1
        lo, hi = min(s[i], s[j]), max(s[i], s[j])
        if hi - lo >= .10 and lo < .80: out.append(((i + j) / 2 / fps, d, hi - lo))
        i = j
    return out
worst = {}
for k, s in regions.items():
    tr = transitions(s); m = 0; at = None
    for t0, _, _ in tr:
        c = sum(1 for t, _, _ in tr if t0 <= t < t0 + 1.0)
        if c // 2 > m: m, at = c // 2, t0
    worst[k] = (m, at, len(tr))
    print(f'{k}: luminance transitions {len(tr)}, max flashes in any 1 s = {m}' + (f' (window at {at:.2f}s)' if at is not None else ''), [(round(t, 2), round(float(dd), 2)) for t, _, dd in tr][:12])
print('PASS' if max(v[0] for v in worst.values()) <= 3 else 'FAIL')
