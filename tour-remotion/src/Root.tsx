/* 「穿越记忆」宣传片 · Remotion 编排
   ─────────────────────────────────────────────────────────
   素材来源：
     · 11 段 3D 空镜，由 tools/xm-studio/record_segments.js 在浏览器里实拍
       （seg-01.mp4 … seg-11.mp4），画面里没有烧任何叠加层
     · 动效音效由 tools/xm-studio/make_sfx.js 合成成 wav
   Remotion 负责：
     · 按帧精确的时间轴（Sequence）
     · 段与段之间的交叉溶解 / 白闪转场
     · 字幕动效（CSS 动画，不用 canvas）
     · 音轨编排（BGM 铺底 + 动效音效）
*/
import { Composition } from 'remotion';
import { XMTour } from './XMTour';
import { FILM_FRAMES } from './timeline';

export const RemotionRoot = () => {
  return (
    <Composition
      id="XMTour"
      component={XMTour}
      durationInFrames={FILM_FRAMES}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
