/* 字幕动效组件
   ─────────────────────────────────────────────────────────
   三种动效（对应 timeline 里的 fx）：
     card  标题卡：左侧色条 + 标题从左滑入 + 下划线按文字宽度生长
     lower 底部说明条：整条从下滑入
     pop   逐字弹入：每个字依次缩放弹出
   全部用 CSS keyframes，Remotion 逐帧渲染时完全确定性。
*/
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Sub } from './timeline';

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export const Subtitle: React.FC<{ s: Sub }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const age = frame / fps;

  if (age < 0 || age > s.dur) return null;

  const aIn = Math.min(1, age / .55);
  const aOut = Math.min(1, (s.dur - age) / .40);
  const alpha = Math.max(0, Math.min(aIn, aOut));
  if (alpha <= 0) return null;

  const accent = s.accent || '#ffd089';

  if (s.fx === 'card') {
    const e = easeOut(aIn);
    const x = 84 - (1 - e) * 110;
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', left: x, bottom: 208, opacity: alpha,
          fontFamily: FONT, transform: `translateX(${(1 - e) * 0}px)`,
        }}>
          <div style={{
            position: 'absolute', left: -24, top: -40, width: 4, height: 74,
            background: accent, borderRadius: 2,
          }} />
          <div style={{
            fontSize: 46, fontWeight: 700, color: '#fff', letterSpacing: 1,
            textShadow: '0 4px 18px rgba(0,0,0,.65)', whiteSpace: 'nowrap',
          }}>{s.title}</div>
          {s.sub && (
            <div style={{
              marginTop: 12, fontSize: 23, color: 'rgba(238,244,252,.92)',
              textShadow: '0 2px 12px rgba(0,0,0,.6)', whiteSpace: 'nowrap',
            }}>{s.sub}</div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  if (s.fx === 'lower') {
    const e = easeOut(aIn);
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 138,
          display: 'flex', justifyContent: 'center',
          opacity: alpha * .92, transform: `translateY(${(1 - e) * 28}px)`,
        }}>
          <div style={{
            maxWidth: 1120, padding: '20px 40px', borderRadius: 18,
            background: 'rgba(8,14,26,.62)', border: '2px solid rgba(255,208,137,.55)',
            fontFamily: FONT, fontSize: 29, fontWeight: 600, color: '#fff',
            textShadow: '0 2px 10px rgba(0,0,0,.5)', whiteSpace: 'nowrap',
          }}>
            {s.title}
            {s.sub ? <span style={{ color: 'rgba(238,244,252,.85)', fontWeight: 400 }}>　{s.sub}</span> : null}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  if (s.fx === 'pop' || s.fx === 'type') {
    const chars = [...s.title];
    const per = Math.max(.045, (s.dur * .45) / chars.length);
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 196,
          textAlign: 'center', fontFamily: FONT, opacity: alpha,
        }}>
          <div style={{
            fontSize: 44, fontWeight: 700, color: '#fff', letterSpacing: 2,
            textShadow: '0 4px 18px rgba(0,0,0,.7)',
          }}>
            {chars.map((ch, i) => {
              const t = Math.max(0, Math.min(1, (age - i * per) / .28));
              const sc = .55 + .45 * easeOut(t);
              return (
                <span key={i} style={{
                  display: 'inline-block',
                  transform: `scale(${sc})`,
                  opacity: Math.min(1, t * 2),
                }}>{ch}</span>
              );
            })}
          </div>
          {s.sub && (
            <div style={{
              marginTop: 14, fontSize: 22, color: 'rgba(238,244,252,.9)',
              textShadow: '0 2px 12px rgba(0,0,0,.6)',
            }}>{s.sub}</div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  return null;
};

/* 白闪转场：盖住段与段之间的硬切 */
export const Flash: React.FC<{ dur: number; at: number; amp: number }> = ({ dur, at, amp }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const age = frame / fps - at;
  if (age < 0 || age > dur) return null;
  const a = Math.sin(Math.PI * (age / dur)) * amp;
  return (
    <AbsoluteFill style={{ background: '#fff', opacity: a, pointerEvents: 'none' }} />
  );
};

/* 章节角标：左上角小字，进段时淡入 */
export const ChapterTag: React.FC<{ name: string }> = ({ name }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const age = frame / fps;
  const a = interpolate(age, [0, .4, 3.2, 4.0], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
  if (a <= 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: 40, top: 34, fontFamily: FONT,
        fontSize: 17, letterSpacing: 2, color: 'rgba(255,255,255,.72)',
        textShadow: '0 2px 10px rgba(0,0,0,.6)', opacity: a,
      }}>{name}</div>
    </AbsoluteFill>
  );
};
