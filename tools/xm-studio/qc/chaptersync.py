#!/usr/bin/env python3
"""章节同步检查 —— 宣传片「字幕/章节角标是否和画面对得上」

从 Opus 5.6 案例库（RezAIT00/agent-demos）学来的做法：
不要用肉眼数帧，用机器量。

做法
----
不是去猜「哪里有转场」，而是拿**源素材里的某一帧**当探针，
在成片里搜「哪一帧跟它最像」——搜到的位置就是这段素材在成片里的真实落点。
然后跟时间轴上写的预期落点相减，差值就是错位帧数。

这个检查抓到过一个大 bug（2026-11-26）：
`all.mp4` 用 concat 拼接时，每段音频比视频长 0.02~0.11 秒，
concat 按容器时长算下一段偏移，误差逐段累加成 24.5 帧（0.82 秒）。
Remotion 按时间戳抽帧 → 画面越往后越晚；字幕按帧号摆 → 字幕和画面对不上，
片尾还少了 0.82 秒。肉眼看只觉得「好像有点怪」，这个脚本直接报出差值。

用法
----
    python3 chaptersync.py <成片.mp4> --segdir <目录含 seg-*.mp4> \
                           --chapters <chapters.json> [--tol 1] [--fps 30]

退出码 0 = 全部对齐；1 = 有段落错位。
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

W, H = 64, 36          # 缩到 64x36 灰度，够判别画面内容，又快
SKIP_BOTTOM = 0.22     # 字幕/角标在下方，遮掉底部 22% 不参与比较


def load_frames(path, fps=30):
    """用 ffmpeg 管道把视频抽成 (N, H, W) 的灰度 numpy 数组"""
    cmd = [
        'ffmpeg', '-v', 'error', '-i', path,
        '-vf', f'scale={W}:{H}', '-pix_fmt', 'gray', '-f', 'rawvideo', '-',
    ]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // (W * H)
    if n == 0:
        raise SystemExit(f'{path}: 抽不出画面')
    return np.frombuffer(raw, dtype=np.uint8)[: n * W * H].reshape(n, H, W).astype(np.float32)


def band(f):
    """取有效比较区（去掉底部字幕区）"""
    cut = int(H * (1 - SKIP_BOTTOM))
    return f[:cut]


def locate(film, probe, lo, hi):
    """在 film[lo:hi] 里找与 probe 最像的一帧，返回 (帧号, 误差)"""
    p = band(probe)
    best = (None, 1e9)
    for k in range(max(0, lo), min(len(film), hi)):
        d = float(np.mean(np.abs(band(film[k]) - p)))
        if d < best[1]:
            best = (k, d)
    return best


def main():
    ap = argparse.ArgumentParser(description='宣传片章节同步检查')
    ap.add_argument('video', help='成片 mp4')
    ap.add_argument('--segdir', required=True, help='含 seg-*.mp4 的目录')
    ap.add_argument('--chapters', required=True, help='chapters.json')
    ap.add_argument('--tol', type=float, default=2.0,
                    help='允许错位帧数（默认 2 帧 = 0.07s，低于感知阈值）')
    ap.add_argument('--trim', type=int, default=1,
                    help='成片侧的系统性偏移：Remotion 的 trimBefore={1} 会让成片第 f 帧 '
                         '取源视频第 f+1 帧，所以源段首帧落在成片 SEG_START-1（默认 1）')
    ap.add_argument('--fps', type=float, default=30)
    ap.add_argument('--window', type=float, default=120, help='搜索窗口帧数（默认 120）')
    args = ap.parse_args()

    with open(args.chapters) as f:
        ch = json.load(f)
    chapters = ch['chapters']

    segs = sorted(x for x in os.listdir(args.segdir) if x.startswith('seg-') and x.endswith('.mp4'))
    if len(segs) != len(chapters):
        print(f'✗ 段数不一致：素材 {len(segs)} 段，章节 {len(chapters)} 段')
        return 1

    print(f'成片 {args.video}')
    print(f'章节 {len(chapters)} 段，允许错位 {args.tol:g} 帧\n')
    film = load_frames(args.video, args.fps)

    bad = 0
    for i, (seg_name, c) in enumerate(zip(segs, chapters)):
        segf = load_frames(os.path.join(args.segdir, seg_name), args.fps)
        if len(segf) == 0:
            print(f'  {seg_name} 空素材')
            return 1
        mid = len(segf) // 2                     # 取段中间那一帧当探针，避开白闪和字幕
        expect = int(round(c['time'] * args.fps)) - args.trim
        # 探针在成片里的位置 ≈ 段起点 + mid，所以段起点 ≈ 命中位置 - mid
        hit, err = locate(film, segf[mid], expect + mid - args.window, expect + mid + args.window)
        if hit is None:
            print(f'  {c["name"]:<16} 没搜到匹配帧')
            bad += 1
            continue
        actual_start = hit - mid
        delta = actual_start - expect
        flag = '✓' if abs(delta) <= args.tol else '✗'
        if abs(delta) > args.tol:
            bad += 1
        print(f'  {flag} {c["name"]:<16} 期望帧 {expect:5d}  实际帧 {actual_start:5d}  '
              f'错位 {delta:+4d} 帧 ({delta / args.fps:+.2f}s)  匹配误差 {err:.2f}')

    print()
    if bad:
        print(f'✗ {bad}/{len(chapters)} 段错位（画面与字幕/章节对不上）')
        return 1
    print(f'✓ 全部 {len(chapters)} 段对齐，最大错位 ≤ {args.tol:g} 帧')
    return 0


if __name__ == '__main__':
    sys.exit(main())
