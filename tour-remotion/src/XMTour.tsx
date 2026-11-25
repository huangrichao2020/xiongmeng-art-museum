/* 「穿越记忆」主合成
   ─────────────────────────────────────────────────────────
   图层顺序（从下到上）：
     1. 整片实拍素材（单条连续视频 all.mp4）
     2. 白闪转场
     3. 字幕动效
     4. 章节角标
   音频：
     · 一条连续的环境音（all.mp4 自带，风 / 设施音）
     · 一条连续的 BGM 铺底（bgm.mp3，单独录的 musicBus）
     · 动效音效（whoosh / bell / water / wind / rumble / chord）

   为什么是「一条连续视频」而不是 11 段各一个 Sequence：
   Remotion 渲染视频时是服务端按 currentTime 抽帧返回图片。逐段挂载时，
   每个 <OffthreadVideo> 都会独立抽帧，实测每段边界会出 60~150 帧黑区
   （成片 47~55 秒整段黑屏就是这个）。改成预先把 11 段拼成一条连续
   视频后逐帧抽，黑区完全消失。
   另外 currentTime = 0 必然抽出黑帧，所以用 trimBefore={1} 让第 0 帧
   去取视频的第 1 帧，总帧数相应少 1 帧。
*/
import React from 'react';
import {
  AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { SEGMENTS, SEG_START } from './timeline';
import { Subtitle, Flash, ChapterTag } from './Subtitle';

/* 整片素材（11 段拼接而成，由 scripts/make_all.js 生成） */
const FILM = 'all.mp4';

export const XMTour: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  /* 环境音音量：按当前帧落在哪一段，算段内淡入淡出，避免硬切爆音 */
  const ambientVolume = (f0: number) => {
    /* trimBefore={1} 会把音量回调的帧号整体 +1，减回来对齐整片时间轴 */
    const f = f0 - 1;
    let i = 0;
    while (i < SEGMENTS.length - 1 && f >= SEG_START[i + 1]) i++;
    const seg = SEGMENTS[i];
    const local = (f - SEG_START[i]) / fps;
    const inA = Math.min(1, local / .35);
    const outA = Math.min(1, (seg.dur - local) / .5);
    return 0.85 * Math.max(0, Math.min(inA, outA));
  };

  return (
    <AbsoluteFill style={{ backgroundColor: '#05070d' }}>

      {/* ── 画面：整片实拍素材 ── */}
      <OffthreadVideo
        src={staticFile(FILM)}
        muted={false}
        trimBefore={1}
        volume={ambientVolume}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* ── 白闪转场 ── */}
      {SEGMENTS.map((seg, i) => {
        if (!seg.flash) return null;
        return (
          <Sequence key={'flash-' + seg.id} from={SEG_START[i]} durationInFrames={Math.round(1.0 * fps)} layout="none">
            <Flash dur={1.0} at={0} amp={seg.flash} />
          </Sequence>
        );
      })}

      {/* ── 字幕 ── */}
      {SEGMENTS.map((seg, i) => {
        if (!seg.subs) return null;
        return seg.subs.map((s, j) => {
          const from = SEG_START[i] + Math.round(s.at * fps);
          const len = Math.round(s.dur * fps);
          return (
            <Sequence key={`${seg.id}-sub-${j}`} from={from} durationInFrames={len} layout="none">
              <Subtitle s={s} />
            </Sequence>
          );
        });
      })}

      {/* ── 章节角标 ── */}
      {SEGMENTS.map((seg, i) => (
        <Sequence key={'tag-' + seg.id} from={SEG_START[i]} durationInFrames={Math.round(4.0 * fps)} layout="none">
          <ChapterTag name={seg.chapter} />
        </Sequence>
      ))}

      {/* ── 音频：连续 BGM 铺底 ── */}
      <Audio src={staticFile('bgm.mp3')} volume={0.55} />

      {/* ── 音频：动效音效 ── */}
      {SEGMENTS.map((seg, i) => {
        if (!seg.sfx) return null;
        return seg.sfx.map((f, j) => {
          const from = SEG_START[i] + Math.round(f.at * fps);
          const len = Math.round(3 * fps);
          return (
            <Sequence key={`${seg.id}-sfx-${j}`} from={from} durationInFrames={len} layout="none">
              <Audio
                src={staticFile(`sfx/${f.name}.wav`)}
                volume={f.vol ?? .6}
              />
            </Sequence>
          );
        });
      })}

    </AbsoluteFill>
  );
};
