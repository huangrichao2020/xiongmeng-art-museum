/* 江南古村 · 传送门（回熊萌艺术馆）
   ------------------------------------------------------------------
   契约（SPEC §传送门 + 主控 main.js 的调用方式）：
     · export const PORTALS = [{x, z, rot, target, label}]  —— 主控拿它做触发判定
     · export function build(layout) → THREE.Group，group.name = 'model-portal'
     · 主控每帧遍历调用 group.userData.update(t, dt)

   位置约定：
     PORTALS[0] 的 x/z 必须和 build() 里法阵实际摆放的世界坐标一致。
     因为村子是按 seed 随机生成的（主控每次重生成 seed 都变），主路端点会跑，
     所以坐标不能写死 —— build(layout) 每次都会按当前 layout 重新求解落位，
     并把结果写回 PORTALS[0]（同一个对象引用，主控拿到的是同一份）。
     build() 之前 PORTALS[0].x/z = 0（此时还没有村子，无意义）。

   落位规则（从 layout 里取，不自己造随机数）：
     ① 主路两端的「村口」内侧（离端点 12~22m，保证在村子核心区、地势是平的）
     ② 沿路侧向偏 5.2~7.6m（不压路面、不挡路，路面在 y=0.03，法阵在 y=0~0.05）
     ③ 硬性排除：水面/水田/房屋/牌坊/宝塔/树/道具/桥面
     ④ 取「离所有障碍余量最大」的那个候选

   做法（9 个 mesh = 9 个 draw call）：
     1. 法阵石台      MAT.stone     直径精确 3.60m，顶面 y=0.05
     2. 石灯柱 ×6 + 牌柱  MAT.stone 柱础/柱身/斗
     3. 金件          MAT.gold      灯盘/灯盖/顶珠/外圈符牌/牌匾框
     4. 纸罩灯 ×6     MAT.paper     暖光纸罩
     5. 地面刻纹      加法混合      同心环 + 放射线 + 篆符（外圈符文）
     6. 中心阵纹      加法混合      缓慢旋转 + 呼吸
     7. 半透明光幕    加法混合      水波纹、缓慢起伏
     8. 中央光柱      MAT.portal    淡青半透光柱
     9. 指示牌        canvas 贴图   「熊萌艺术馆 / 返回艺术馆」

   随机数：只用 makeRng(layout.seed ^ 0x50a1)，不用 Math.random。
   只读 layout，不改 layout。 */
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { MAT, initMaterials } from '../core/materials.js';
import { mergeGeometries, meshOf, nonIndexed } from '../core/geo.js';
import { aoPatch, aoBatch } from '../core/ao.js';

/* ── 尺寸常量 ─────────────────────────────────────────────── */
const R = 1.80;              // 法阵半径 → 直径 3.60m（硬指标）
const DECK_H = 0.05;         // 石台顶面：y = 0.05（石台整体埋进地里）
const EMBED_Y = 0.052;       // 刻纹层
const CORE_Y = 0.056;        // 中心阵纹层
const CURB_R = 2.12;         // 石框外沿（法阵盘 + 一圈石框）
const APRON_R = 2.90;        // 石板铺地外沿（法阵是"嵌在石板地里"，不是浮在草上）
const LAMP_R = 2.52;         // 石灯柱 / 石碑所在圈半径
const SIGN_R = 2.55;         // 指示牌半径（朝路一侧）
const CURTAIN_H = 2.30;      // 光幕高
const COL_H = 2.60;          // 光柱高
const AO_Y = 0.030;          // 接地阴影贴片高度（压在石板之上、草地之上）

/* 路面半宽（对齐 core/models/roads.js 的 KIND 宽度） */
const ROAD_HALF = { main: 1.70, stone: 1.20, dirt: 0.85 };

export const PORTALS = [{
  x: 0, z: 0, rot: 0,
  target: 'https://preview.ai10088.com/alex-garage/',
  label: '熊萌艺术馆'
}];

/* ── 小工具 ───────────────────────────────────────────────── */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
/* 点到轴对齐矩形的距离（矩形以中心 + 半宽给出） */
function rectDist(px, pz, cx, cz, hw, hh) {
  const dx = Math.max(Math.abs(px - cx) - hw, 0);
  const dz = Math.max(Math.abs(pz - cz) - hh, 0);
  return Math.hypot(dx, dz);
}
function seedOf(layout) {
  const s = layout && layout.seed;
  if (typeof s === 'number' && isFinite(s)) return s | 0;
  const n = parseInt(String(s), 10);
  return isNaN(n) ? 0 : (n | 0);
}

/* 指示牌落点检查：牌子立在朝路那侧 2.55m，不能贴到房子/树上，也不能插进水田 */
function signSpotOk(layout, sx, sz) {
  const cell = layout.cell;
  const gx = Math.floor((sx - layout.originX) / cell);
  const gz = Math.floor((sz - layout.originZ) / cell);
  const t = layout.cellType(gx, gz);
  if (t & (layout.TYPE.WATER | layout.TYPE.FIELD | layout.TYPE.HOUSE |
    layout.TYPE.PAIFANG | layout.TYPE.TOWER)) return false;
  for (const h of (layout.houses || [])) if (rectDist(sx, sz, h.x, h.z, 3.2, 3.2) < 1.30) return false;
  for (const tr of (layout.trees || [])) if (Math.hypot(sx - tr.x, sz - tr.z) < 1.10) return false;
  for (const pr of (layout.props || [])) if (Math.hypot(sx - pr.x, sz - pr.z) < 0.90) return false;
  for (const pf of (layout.paifangs || [])) if (Math.hypot(sx - pf.x, sz - pf.z) < 5.00) return false;
  if (layout.tower && Math.hypot(sx - layout.tower.x, sz - layout.tower.z) < 5.00) return false;
  return true;
}

/* ── 落位求解 ─────────────────────────────────────────────── */
/* 返回 {x, z, rot, clear}：rot 让局部 +Z 指向路面（指示牌朝路） */
function solveSite(layout, relax) {
  const cell = layout.cell, originX = layout.originX, originZ = layout.originZ;
  const gxOf = p => Math.floor((p.x - originX) / cell);
  const gzOf = p => Math.floor((p.z - originZ) / cell);

  /* 主路优先，没有就用第一条路 */
  const roads = layout.roads || [];
  const main = roads.find(r => r.kind === 'main') || roads[0];
  if (!main) return null;

  const ends = [
    { p: { x: main.x1, z: main.z1 }, q: { x: main.x2, z: main.z2 } },
    { p: { x: main.x2, z: main.z2 }, q: { x: main.x1, z: main.z1 } }
  ];

  const waterNeed = 2.60 - relax * 0.8;      // 离水面至少这些米
  const houseNeed = 3.00 - relax * 0.7;     // 离房屋（灯柱圈半径 2.32）
  const fieldNeed = 2.80 - relax * 0.7;     // 离水田
  const treeNeed = 3.00 - relax * 0.9;      // 离树
  const propNeed = 2.20 - relax * 0.7;      // 离道具
  const paifangNeed = 7.00 - relax * 1.6;   // 离牌坊（跨度 9m）
  const towerNeed = 7.00 - relax * 1.6;     // 离宝塔
  const roadNeed = 2.20 - relax * 0.6;      // 离路缘（石台半径 1.8）

  let best = null;
  for (const e of ends) {
    const dx = e.q.x - e.p.x, dz = e.q.z - e.p.z;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;          // 沿路方向（朝村子内部）
    const px = -uz, pz = ux;                 // 垂直路方向
    for (const dEnd of [12, 17, 22]) {
      for (const off of [5.2, 6.4, 7.6]) {
        for (const side of [1, -1]) {
          const cx = e.p.x + ux * dEnd + px * off * side;
          const cz = e.p.z + uz * dEnd + pz * off * side;

          /* 网格内 + 核心区内（核心区地势是平的） */
          const gx = gxOf({ x: cx }), gz = gzOf({ x: cx, z: cz });
          if (gx < 4 || gz < 4 || gx > layout.W - 5 || gz > layout.H - 5) continue;

          /* 只查「石台真的压到」的格子：格矩形离圆心 < R + 0.15 */
          let bad = false;
          const rad = R + 0.15;
          const g0x = gxOf({ x: cx - rad }), g1x = gxOf({ x: cx + rad });
          const g0z = gzOf({ x: cz - rad }), g1z = gzOf({ x: cz + rad });
          for (let zz = g0z; zz <= g1z && !bad; zz++) {
            for (let xx = g0x; xx <= g1x; xx++) {
              const ccx = originX + (xx + .5) * cell, ccz = originZ + (zz + .5) * cell;
              const dx = Math.max(Math.abs(cx - ccx) - cell / 2, 0);
              const dz = Math.max(Math.abs(cz - ccz) - cell / 2, 0);
              if (Math.hypot(dx, dz) >= rad) continue;   // 这一格石台压不到
              const t = layout.cellType(xx, zz);
              if (t & (layout.TYPE.WATER | layout.TYPE.FIELD | layout.TYPE.HOUSE |
                layout.TYPE.PAIFANG | layout.TYPE.TOWER)) { bad = true; break; }
            }
          }
          if (bad) continue;

          /* 与各类实体的距离 */
          let clear = 99;
          for (const r of roads) {
            const d = segDist(cx, cz, r.x1, r.z1, r.x2, r.z2) - (ROAD_HALF[r.kind] ?? 1.0);
            if (d < roadNeed) { bad = true; break; }       // 石台不许压路面
            clear = Math.min(clear, d - roadNeed);
            /* 指示牌那一侧也要离路缘留出空当 */
            if (segDist(cx, cz, r.x1, r.z1, r.x2, r.z2) - SIGN_R - (ROAD_HALF[r.kind] ?? 1.0) < 0.60) {
              bad = true; break;
            }
          }
          if (bad) continue;
          for (const rv of (layout.rivers || [])) {
            const d = segDist(cx, cz, rv.x1, rv.z1, rv.x2, rv.z2) - rv.w / 2;
            if (d < waterNeed) { bad = true; break; }
            clear = Math.min(clear, d - waterNeed);
          }
          if (bad) continue;
          for (const h of (layout.houses || [])) {
            const d = rectDist(cx, cz, h.x, h.z, 3.2, 3.2);
            if (d < houseNeed) { bad = true; break; }
            clear = Math.min(clear, d - houseNeed);
          }
          if (bad) continue;
          for (const f of (layout.fields || [])) {
            const d = rectDist(cx, cz, f.x, f.z, f.w * cell / 2, f.h * cell / 2);
            if (d < fieldNeed) { bad = true; break; }
            clear = Math.min(clear, d - fieldNeed);
          }
          if (bad) continue;
          for (const t of (layout.trees || [])) {
            const d = Math.hypot(cx - t.x, cz - t.z) - 0.8;
            if (d < treeNeed) { bad = true; break; }
            clear = Math.min(clear, d - treeNeed);
          }
          if (bad) continue;
          for (const pr of (layout.props || [])) {
            const d = Math.hypot(cx - pr.x, cz - pr.z);
            if (d < propNeed) { bad = true; break; }
            clear = Math.min(clear, d - propNeed);
          }
          if (bad) continue;
          for (const pf of (layout.paifangs || [])) {
            const d = Math.hypot(cx - pf.x, cz - pf.z);
            if (d < paifangNeed) { bad = true; break; }
            clear = Math.min(clear, d - paifangNeed);
          }
          if (bad) continue;
          if (layout.tower) {
            const d = Math.hypot(cx - layout.tower.x, cz - layout.tower.z);
            if (d < towerNeed) { bad = true; break; }
            clear = Math.min(clear, d - towerNeed);
          }
          if (bad) continue;

          /* 朝向：局部 +Z 指向主路（脚点必须在主路中段，不能歪到路尽头） */
          const mvx = main.x2 - main.x1, mvz = main.z2 - main.z1;
          const mL2 = mvx * mvx + mvz * mvz;
          let mt = mL2 > 1e-9 ? ((cx - main.x1) * mvx + (cz - main.z1) * mvz) / mL2 : 0;
          mt = Math.max(0, Math.min(1, mt));
          if (mt < 0.06 || mt > 0.94) continue;
          const fx = main.x1 + mvx * mt, fz = main.z1 + mvz * mt;
          const fdx = fx - cx, fdz = fz - cz, fdl = Math.hypot(fdx, fdz) || 1;
          const rot = Math.atan2(fdx / fdl, fdz / fdl);
          /* 指示牌立在朝路那侧，落点必须干净 */
          if (!signSpotOk(layout, cx + Math.sin(rot) * SIGN_R, cz + Math.cos(rot) * SIGN_R)) continue;

          /* 记分：余量够用就好（封顶，别让「空旷」压过「好走」），
             同等条件下取离路更近、离村口更近的位置 */
          const score = Math.min(clear, 2.2) * 1.0
            - Math.abs(off - 5.6) * 0.85
            + Math.min(dEnd, 22) * 0.05;
          if (!best || score > best.score) {
            best = { x: cx, z: cz, rot, clear, score };
          }
        }
      }
    }
  }
  return best;
}

/* ── canvas 贴图：地面刻纹（同心环 + 放射线 + 篆符） ─────────── */
function sealGlyph(g, cx, cy, s, kind) {
  const strokes = SEAL[kind % SEAL.length];
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.lineWidth = 0.11;
  g.lineCap = 'square';
  for (const st of strokes) {
    g.beginPath();
    g.moveTo(st[0], st[1]);
    for (let i = 2; i < st.length; i += 2) g.lineTo(st[i], st[i + 1]);
    g.stroke();
  }
  g.restore();
}
/* 抽象篆书笔形（局部坐标 -0.5 ~ 0.5） */
const SEAL = [
  [[0, -.45, 0, .45], [-.34, -.18, .34, -.18], [-.34, .18, .34, .18]],          // 王
  [[-.4, -.4, .4, -.4, .4, .4, -.4, .4, -.4, -.05, .1, -.05]],                  // 回
  [[-.38, -.4, .38, -.4, .38, .4, -.38, .4, -.38, -.4], [-.38, 0, .38, 0]],     // 日
  [[-.4, .42, .4, .42], [-.28, .42, -.28, -.42], [.28, .42, .28, -.42], [-.28, -.42, .28, -.42]], // 山
  [[-.4, -.4, .4, -.4, .4, .4, -.4, .4, -.4, -.4], [-.4, 0, .4, 0], [0, -.4, 0, .4]], // 田
  [[-.42, .28, .42, .28], [-.22, .28, -.22, -.4], [.22, .28, .22, -.4]],       // 丁
  [[-.4, -.4, .4, .4], [-.4, .4, .4, -.4]],                                    // 乂
  [[0, -.45, 0, .45], [-.4, -.45, -.4, .45], [.4, -.45, .4, .45], [0, -.1, .4, -.1]] // 卜
];

function engraveTex() {
  const S = 1024, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const C = S / 2;
  g.clearRect(0, 0, S, S);
  g.lineCap = 'butt';

  const ring = (rr, w, a, col) => {
    g.beginPath();
    g.arc(C, C, rr * C, 0, Math.PI * 2);
    g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = w;
    g.stroke();
    g.globalAlpha = 1;
  };
  /* 同心环 */
  ring(0.965, 8, 1.0, '#8ff0dc');
  ring(0.935, 3.0, .70, '#f2d489');
  ring(0.780, 6, .95, '#8ff0dc');
  ring(0.735, 2.4, .60, '#f2d489');
  ring(0.620, 4.5, .85, '#8ff0dc');
  ring(0.560, 2.4, .55, '#8ff0dc');
  ring(0.430, 4.0, .70, '#f2d489');

  /* 放射线（两道短线一组，像刻度） */
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const long = (i % 2 === 0);
    const r0 = 0.625 * C, r1 = (long ? 0.775 : 0.720) * C;
    g.beginPath();
    g.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
    g.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
    g.strokeStyle = long ? 'rgba(143,240,220,.80)' : 'rgba(242,212,137,.55)';
    g.lineWidth = long ? 5 : 3;
    g.stroke();
  }

  /* 外圈符文（12 枚篆符） */
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const rr = 0.855 * C;
    g.strokeStyle = '#ffe6a8';
    g.globalAlpha = .92;
    sealGlyph(g, C + Math.cos(a) * rr, C + Math.sin(a) * rr, 78, i);
    g.globalAlpha = 1;
  }

  /* 内圈小符（8 枚） */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const rr = 0.500 * C;
    g.strokeStyle = '#9ff2e2';
    g.globalAlpha = .62;
    sealGlyph(g, C + Math.cos(a) * rr, C + Math.sin(a) * rr, 52, i + 3);
    g.globalAlpha = 1;
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ── canvas 贴图：中心阵纹（会转的那张） ───────────────────── */
function coreTex() {
  const S = 512, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const C = S / 2;
  g.clearRect(0, 0, S, S);

  /* 同心圆 */
  const ring = (rr, w, a, col) => {
    g.beginPath(); g.arc(C, C, rr * C, 0, Math.PI * 2);
    g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = w; g.stroke(); g.globalAlpha = 1;
  };
  ring(0.95, 4, .8, '#9ff2e2');
  ring(0.86, 1.6, .45, '#ffe6a8');
  ring(0.58, 3, .7, '#ffe6a8');
  ring(0.24, 3.4, .85, '#bffaf0');

  /* 八向旋臂 */
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    g.beginPath();
    for (let k = 0; k <= 26; k++) {
      const rr = (0.24 + 0.60 * (k / 26)) * C;
      const a = a0 + (k / 26) * 1.35;
      const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
      k === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(150,242,226,.72)';
    g.lineWidth = 3.2; g.stroke();
    /* 臂端小符 */
    const ae = a0 + 1.35, re = 0.84 * C;
    g.strokeStyle = '#ffe6a8'; g.globalAlpha = .85;
    sealGlyph(g, C + Math.cos(ae) * re, C + Math.sin(ae) * re, 40, i);
    g.globalAlpha = 1;
  }

  /* 中心篆符 */
  g.strokeStyle = '#f2dcae';
  sealGlyph(g, C, C, 150, 3);
  g.strokeStyle = 'rgba(242,220,174,.36)';
  sealGlyph(g, C, C, 210, 6);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ── canvas 贴图：光幕水波纹 ─────────────────────────────── */
function curtainTex() {
  const W = 128, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  for (let y = 0; y < H; y += 5) {
    const t = y / H;
    const fade = Math.pow(1 - t, 1.6);
    const a = (0.45 + 0.55 * Math.abs(Math.sin(t * 9.5))) * fade;
    g.strokeStyle = `rgba(158,244,229,${(a * 0.55).toFixed(3)})`;
    g.lineWidth = 2.4;
    g.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const yy = y + Math.sin(x * 0.10 + y * 0.07) * 3.4 + Math.sin(x * 0.031 - y * 0.11) * 2.2;
      if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ── canvas 贴图：指示牌（「熊萌艺术馆 / 返回艺术馆」） ───── */
function signTex() {
  const W = 768, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  /* 纸底 */
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#f7ead0');
  grd.addColorStop(.5, '#efe0c2');
  grd.addColorStop(1, '#e6d4b2');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  /* 纸纹斑点 */
  g.globalAlpha = .10;
  for (let i = 0; i < 900; i++) {
    g.fillStyle = i % 3 ? '#8a7a5c' : '#fffaf0';
    g.fillRect((i * 137) % W, (i * 71) % H, 2, 2);
  }
  g.globalAlpha = 1;
  /* 墨框 */
  g.strokeStyle = '#3a2e20'; g.lineWidth = 5; g.strokeRect(16, 16, W - 32, H - 32);
  g.strokeStyle = 'rgba(58,46,32,.45)'; g.lineWidth = 2; g.strokeRect(26, 26, W - 52, H - 52);
  /* 主标题 */
  g.fillStyle = '#241c12';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 104px "Songti SC","STSong","SimSun",serif';
  g.fillText('熊萌艺术馆', W / 2, H / 2 - 18);
  /* 副题 */
  g.fillStyle = 'rgba(58,46,32,.78)';
  g.font = '40px "Songti SC","STSong","SimSun",serif';
  g.fillText('返回艺术馆', W / 2, H / 2 + 62);
  /* 两侧小箭头 */
  g.strokeStyle = 'rgba(36,28,18,.7)'; g.lineWidth = 5; g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ax = W / 2 + s * 300, ay = H / 2 + 62;
    g.beginPath();
    g.moveTo(ax - s * 26, ay - 14); g.lineTo(ax, ay); g.lineTo(ax - s * 26, ay + 14);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ── 几何小工具 ───────────────────────────────────────────── */
function boxG(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function cylG(rTop, rBot, h, x, y, z, seg = 14) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
  g.translate(x, y, z);
  return g;
}
function coneG(r, h, x, y, z, seg = 12) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(x, y, z);
  return g;
}
/* 旋成体：profile = [[r, y], ...]（顺序决定法线朝向：底→外→上→内） */
function latheG(profile, seg = 48) {
  const pts = profile.map(p => new THREE.Vector2(Math.max(p[0], 0.0001), p[1]));
  return new THREE.LatheGeometry(pts, seg);
}
/* 环形扇形板（一块石板）：平铺在地面上 */
function slabRingG(rIn, rOut, a0, a1, y, seg = 4) {
  const g = new THREE.RingGeometry(rIn, rOut, seg, 1, a0, a1 - a0);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
/* 平面投影 UV：贴图按真实尺度铺 */
function planarUV(g, S) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  if (!p || !n || !uv) return g;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else if (nx >= nz) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / S, v / S);
  }
  uv.needsUpdate = true;
  return g;
}
/* 顶点色明暗：朝上的面亮、朝下暗；带一道高度渐变 */
function shade(g, opt = {}) {
  const p = g.attributes.position, nrm = g.attributes.normal;
  const n = p.count;
  const col = new Float32Array(n * 3);
  const y0 = opt.y0 ?? 0, y1 = opt.y1 ?? 1;
  const s0 = opt.s0 ?? .86, s1 = opt.s1 ?? 1.08;
  const up = opt.up ?? .18, jit = opt.jit ?? .05;
  const tone = opt.tone ?? 1;             // 整件色调档（基座深/柱身中/雕饰浅）
  const grain = opt.grain ?? 0;
  const gmode = opt.grainMode ?? 'auto';
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, yb0 = 1e9, yb1 = -1e9;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
    if (y < yb0) yb0 = y; if (y > yb1) yb1 = y;
  }
  const cx = (x0 + x1) * .5, cz = (z0 + z1) * .5;
  const alongX = (x1 - x0) >= (z1 - z0);
  const vertical = (yb1 - yb0) > Math.max(x1 - x0, z1 - z0);
  const useV = gmode === 'auto' ? vertical : (gmode === 'v');
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let t = (y - y0) / Math.max(1e-4, y1 - y0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    let k = s0 + (s1 - s0) * t;
    if (nrm) k *= 1 + up * nrm.getY(i);
    if (jit) {
      const v = 0.5 + 0.5 * Math.sin(x * 2.7 + z * 1.9 + y * 1.3) * Math.cos(z * 2.2 - y * 1.7);
      k *= 1 + jit * (v - 0.5) * 2;
    }
    if (grain) {
      let gv;
      if (useV) {
        const ang = Math.atan2(z - cz, x - cx);
        gv = Math.sin(ang * 7 + y * 0.5) * 0.62 + Math.sin(ang * 19) * 0.38;
      } else {
        const a = alongX ? (x - cx) : (z - cz);
        gv = Math.sin(a * 9 + y * 1.1) * 0.62 + Math.sin(a * 23) * 0.38;
      }
      k *= 1 + grain * gv;
    }
    k *= tone;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/* 凿痕：低频顶点起伏（±amp），石头不是光板 */
function chisel(g, amp = 0.016, freq = 1.4) {
  const p = g.attributes.position;
  const n = p.count;
  let ymin = 1e9, ymax = -1e9;
  for (let i = 0; i < n; i++) { const y = p.getY(i); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  const hh = Math.max(1e-4, ymax - ymin);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nv = Math.sin(x * freq + z * 0.63) * Math.cos(z * freq * 1.27 - y * 0.81)
      + 0.55 * Math.sin(y * freq * 1.9 + x * 1.4 + z * 0.9);
    const dx = Math.sin(x * 0.87 + z * 0.61), dy = Math.sin(y * 1.03 + x * 0.47), dz = Math.cos(z * 0.79 - y * 0.43);
    const L = Math.hypot(dx, dy, dz) || 1;
    const ty = (y - ymin) / hh;
    const fade = Math.min(1, 5 * Math.min(ty, 1 - ty));
    const k = (nv / 1.55) * amp * fade;
    p.setXYZ(i, x + dx / L * k, y + dy / L * k, z + dz / L * k);
  }
  g.computeVertexNormals();
  return g;
}
/* 材质克隆：统一开 vertexColors，不动共享材质 */
function matClone(base, over = {}) {
  const m = base.clone();
  for (const k in over) {
    if (k === 'color' || k === 'emissive') {
      /* color 可以给 [r,g,b]（线性值，允许 >1）：贴图本身已经带深色 */
      if (Array.isArray(over[k])) m[k].setRGB(over[k][0], over[k][1], over[k][2]);
      else m[k] = new THREE.Color(over[k]);
    }
    else m[k] = over[k];
  }
  m.vertexColors = true;
  m.needsUpdate = true;
  return m;
}

/* ── 接地阴影（AO 贴片）──────────────────────────────────────
   法阵最像"贴纸"的地方就是：草地上浮着一块发光的圆。
   这里在石板铺地的外沿压一圈软影 —— 影跟着铺地的边走，
   法阵就被"焊"在地面上了。所有贴片合成一个 mesh，只多 1 个 draw call。 */
let _aoMat = null;
function aoMaterial() {
  if (_aoMat) return _aoMat;
  const src = aoPatch(1, .5).material;
  _aoMat = new THREE.MeshBasicMaterial({
    map: src.map, transparent: true, depthWrite: false,
    blending: THREE.MultiplyBlending, vertexColors: true,
    side: THREE.FrontSide, toneMapped: false,
  });
  _aoMat.name = 'mat-portal-ao';
  return _aoMat;
}
function aoDisc(x, z, r, s, y = AO_Y) {
  const g = new THREE.CircleGeometry(1, 22);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3);
  const k = 1 - Math.max(0, Math.min(1, s));
  for (let i = 0; i < n; i++) {
    const d = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)));
    const v = 1 - k * Math.max(0, 1 - d * d);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(r, 1, r);
  g.translate(x, y, z);
  return g;
}
/* 环形接地阴影：一圈贴着基座外沿的软影。
   为什么不用一叠小圆盘：MultiplyBlending 是相乘的，叠 12 张就黑成一块。
   这里改成一张方格网 —— UV 按世界尺度铺（共享径向贴图在中心最暗），
   顶点色把"暗"挪到指定的半径上：中心那一圈正好被法阵盘盖住看不见，
   露出来的是紧贴铺地外沿的一圈软影。 */
function aoRingGeo(rIn, rOut, s, y = AO_Y, N = 40, band = 0.80) {
  const pos = [], uvs = [], cols = [], idx = [];
  const step = (rOut * 2) / N;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -rOut + i * step, z = -rOut + j * step;
      const r = Math.hypot(x, z);
      pos.push(x, y, z);
      uvs.push(x / (2 * rOut) + 0.5, z / (2 * rOut) + 0.5);
      const t1 = Math.max(0, Math.min(1, (r - (rIn - band)) / band));
      const t2 = Math.max(0, Math.min(1, (rOut - r) / band));
      const bump = (t1 * t1 * (3 - 2 * t1)) * (t2 * t2 * (3 - 2 * t2));
      const k = 1 - (1 - Math.max(0, Math.min(1, s))) * bump;
      cols.push(k, k, k);
    }
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ── 落位求解 · 第二步：全村扫描（第一步找不到时的兜底） ────
   在村子核心区里逐格找「空地 + 离主路端点不太远 + 离所有障碍有余量」的位置。 */
function scanSite(layout, relax) {
  const cell = layout.cell, originX = layout.originX, originZ = layout.originZ;
  const roads = layout.roads || [];
  const main = roads.find(r => r.kind === 'main') || roads[0];
  if (!main) return null;
  const ends = [{ x: main.x1, z: main.z1 }, { x: main.x2, z: main.z2 }];

  const houseNeed = 2.70 - relax * 0.5;
  const fieldNeed = 2.50 - relax * 0.5;
  const waterNeed = 2.30 - relax * 0.5;
  const treeNeed = 2.40 - relax * 0.5;
  const propNeed = 1.70 - relax * 0.4;
  const paifangNeed = 5.20 - relax * 1.0;
  const towerNeed = 5.20 - relax * 1.0;
  const roadNeed = 2.20 - relax * 0.4;

  const rad = R + 0.15;
  let best = null;
  for (let gz = 2; gz < layout.H - 2; gz++) {
    for (let gx = 2; gx < layout.W - 2; gx++) {
      const cx = originX + (gx + .5) * cell, cz = originZ + (gz + .5) * cell;
      /* 硬条件：石台压到的格子不能是水/田/房/牌坊/塔 */
      let bad = false;
      for (let zz = gz - 1; zz <= gz + 1 && !bad; zz++) {
        for (let xx = gx - 1; xx <= gx + 1; xx++) {
          const ccx = originX + (xx + .5) * cell, ccz = originZ + (zz + .5) * cell;
          const ddx = Math.max(Math.abs(cx - ccx) - cell / 2, 0);
          const ddz = Math.max(Math.abs(cz - ccz) - cell / 2, 0);
          if (Math.hypot(ddx, ddz) >= rad) continue;
          const t = layout.cellType(xx, zz);
          if (t & (layout.TYPE.WATER | layout.TYPE.FIELD | layout.TYPE.HOUSE |
            layout.TYPE.PAIFANG | layout.TYPE.TOWER)) { bad = true; break; }
        }
      }
      if (bad) continue;

      /* 离主路端点不能太远（要在村口一带） */
      let dEnd = 1e9;
      for (const e of ends) dEnd = Math.min(dEnd, Math.hypot(cx - e.x, cz - e.z));
      if (dEnd > 42) continue;

      /* 必须落在主路的「村子内段」上（投影点在线段内部）——
         这样才是在村子核心区里（地势是平的），而不是跑到村外的坡地上 */
      const mvx = main.x2 - main.x1, mvz = main.z2 - main.z1;
      const mL2 = mvx * mvx + mvz * mvz;
      let mt = mL2 > 1e-9 ? ((cx - main.x1) * mvx + (cz - main.z1) * mvz) / mL2 : 0;
      mt = Math.max(0, Math.min(1, mt));
      if (mt < 0.10 || mt > 0.90) continue;
      const perp = Math.hypot(cx - (main.x1 + mvx * mt), cz - (main.z1 + mvz * mt));
      if (perp > 38) continue;

      let clear = 99;
      for (const r of roads) {
        const half = ROAD_HALF[r.kind] ?? 1.0;
        const d = segDist(cx, cz, r.x1, r.z1, r.x2, r.z2);
        if (d - half < roadNeed) { bad = true; break; }
        if (d - SIGN_R - half < 0.60) { bad = true; break; }
        clear = Math.min(clear, d - half - roadNeed);
      }
      if (bad) continue;
      for (const rv of (layout.rivers || [])) {
        const d = segDist(cx, cz, rv.x1, rv.z1, rv.x2, rv.z2) - rv.w / 2;
        if (d < waterNeed) { bad = true; break; }
        clear = Math.min(clear, d - waterNeed);
      }
      if (bad) continue;
      for (const h of (layout.houses || [])) {
        const d = rectDist(cx, cz, h.x, h.z, 3.2, 3.2);
        if (d < houseNeed) { bad = true; break; }
        clear = Math.min(clear, d - houseNeed);
      }
      if (bad) continue;
      for (const f of (layout.fields || [])) {
        const d = rectDist(cx, cz, f.x, f.z, f.w * cell / 2, f.h * cell / 2);
        if (d < fieldNeed) { bad = true; break; }
        clear = Math.min(clear, d - fieldNeed);
      }
      if (bad) continue;
      for (const t of (layout.trees || [])) {
        const d = Math.hypot(cx - t.x, cz - t.z) - 0.8;
        if (d < treeNeed) { bad = true; break; }
        clear = Math.min(clear, d - treeNeed);
      }
      if (bad) continue;
      for (const pr of (layout.props || [])) {
        const d = Math.hypot(cx - pr.x, cz - pr.z);
        if (d < propNeed) { bad = true; break; }
        clear = Math.min(clear, d - propNeed);
      }
      if (bad) continue;
      for (const pf of (layout.paifangs || [])) {
        const d = Math.hypot(cx - pf.x, cz - pf.z);
        if (d < paifangNeed) { bad = true; break; }
        clear = Math.min(clear, d - paifangNeed);
      }
      if (bad) continue;
      if (layout.tower) {
        const d = Math.hypot(cx - layout.tower.x, cz - layout.tower.z);
        if (d < towerNeed) { bad = true; break; }
        clear = Math.min(clear, d - towerNeed);
      }
      if (bad) continue;

      /* 离路远一点好走，但别太远（< 14m） */
      const dMain = segDist(cx, cz, main.x1, main.z1, main.x2, main.z2);
      if (dMain > 14) continue;
      /* 朝向与指示牌 */
      const rot = Math.atan2((main.x1 + mvx * mt) - cx, (main.z1 + mvz * mt) - cz);
      if (!signSpotOk(layout, cx + Math.sin(rot) * SIGN_R, cz + Math.cos(rot) * SIGN_R)) continue;
      const score = Math.min(clear, 2.0) * 0.8 - Math.abs(dMain - 6.4) * 0.9 - Math.abs(dEnd - 20) * 0.05;
      if (!best || score > best.score) {
        best = { x: cx, z: cz, rot, clear, score };
      }
    }
  }
  return best;
}

/* ── 主入口 ───────────────────────────────────────────────── */
export function build(layout) {
  const group = new THREE.Group();
  group.name = 'model-portal';

  initMaterials();
  const r = makeRng((seedOf(layout) ^ 0x50a1) >>> 0);

  /* ═══ 1. 落位 ═══════════════════════════════════════════ */
  let site = null;
  for (let relax = 0; relax <= 3 && !site; relax++) {
    site = solveSite(layout, relax) || scanSite(layout, relax);
  }
  if (!site) {
    /* 实在找不到就退到主路中点旁边（最后兜底，仍保证不压水/田/房） */
    const main = (layout.roads || []).find(r0 => r0.kind === 'main') || (layout.roads || [])[0];
    if (!main) return group;
    const cx = (main.x1 + main.x2) / 2, cz = (main.z1 + main.z2) / 2;
    site = { x: cx + 6, z: cz + 6, rot: 0, clear: 0 };
  }
  PORTALS[0].x = site.x;
  PORTALS[0].z = site.z;
  PORTALS[0].rot = site.rot;

  group.position.set(site.x, 0, site.z);
  group.rotation.y = site.rot;

  /* ═══ 2. 法阵石台（嵌进地里的圆盘，直径精确 3.60m） ═════
     做法：用车出来的旋成体，剖面里直接刻三道凹槽（同心刻线），
     台体下半截埋进地里（y 从 -0.14 到 +0.05），
     所以它读作"地上的一块石盘"，而不是"浮在草上的贴片"。 */
  const deck = latheG([
    [0.00, -0.14], [R, -0.14], [R, DECK_H],
    [1.52, DECK_H], [1.48, 0.024], [1.44, DECK_H],
    [1.08, DECK_H], [1.04, 0.024], [1.00, DECK_H],
    [0.66, DECK_H], [0.62, 0.024], [0.58, DECK_H],
    [0.00, DECK_H],
  ], 72);
  planarUV(deck, 4.2);
  /* 刻线槽底压暗 —— 刻痕靠这个读出来 */
  {
    const p = deck.attributes.position, nr = deck.attributes.normal, n = p.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i));
      const inGroove = (p.getY(i) < 0.040) && (r > 0.55 && r < 1.55);
      let k = inGroove ? 0.34 : 1.0;
      k *= 1 + 0.14 * nr.getY(i);
      const x = p.getX(i), z = p.getZ(i);
      const v = 0.5 + 0.5 * Math.sin(x * 2.7 + z * 1.9) * Math.cos(z * 2.2 - x * 1.1);
      k *= 1 + 0.06 * (v - 0.5) * 2;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    deck.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const matStone = matClone(MAT.stone, { color: 0xb4b0a4 });
  matStone.side = THREE.DoubleSide;            // 旋成体的背面也留着，省得绕序错了露馅
  const deckMesh = new THREE.Mesh(deck, matStone);
  deckMesh.name = 'pf-deck';
  deckMesh.castShadow = true; deckMesh.receiveShadow = true;
  group.add(deckMesh);

  /* ═══ 3. 石框 + 石板铺地（法阵"嵌在石板地里"的关键） ═════ */
  const stoneParts = [];
  const darkParts = [];
  const goldParts = [];
  const paperParts = [];
  /* tone：整件色调档 —— 石件分「基座深 / 柱身中 / 雕饰浅」三档 */
  const TONE = new Map();
  const st = (g, tone = 1) => { stoneParts.push(g); TONE.set(g, tone); return g; };
  const dk = (g, tone = 1) => { darkParts.push(g); TONE.set(g, tone); return g; };
  const gd = (g, tone = 1) => { goldParts.push(g); TONE.set(g, tone); return g; };

  /* 铺地底板：整块沉在地里的石台（-0.12 → +0.008）。
     没有它，铺地就是几张浮在草上的薄片，侧面看是悬空的。 */
  st(latheG([
    [CURB_R - 0.06, -0.12], [APRON_R + 0.03, -0.12], [APRON_R + 0.03, 0.008],
    [APRON_R - 0.02, 0.008], [CURB_R - 0.06, 0.008], [CURB_R - 0.06, -0.12],
  ], 64), 0.82);

  /* 石框：一圈起线的石唇，把法阵盘箍住 */
  st(latheG([
    [R - 0.02, -0.10], [CURB_R, -0.10], [CURB_R, 0.11],
    [CURB_R - 0.07, 0.16], [R + 0.06, 0.16], [R - 0.02, 0.11],
    [R - 0.02, -0.10],
  ], 64), 1.10);

  /* 石板铺地：两圈石板，板与板之间留缝，缝里是深色砂浆 */
  dk((() => {
    const g = new THREE.RingGeometry(CURB_R - 0.03, APRON_R, 64, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.011, 0);
    return g;
  })(), 0.84);
  {
    const RINGS = [[CURB_R - 0.02, 2.48, 20], [2.52, APRON_R, 26]];
    for (const [r0, r1, cnt] of RINGS) {
      const step = (Math.PI * 2) / cnt;
      for (let i = 0; i < cnt; i++) {
        const a0 = i * step + step * 0.055;
        const a1 = (i + 1) * step - step * 0.055;
        st(slabRingG(r0, r1, a0, a1, 0.018, 4), 1.00 + (i % 3) * 0.035);
      }
    }
  }

  /* ═══ 4. 六根石灯柱 + 四方石碑 + 指示牌立柱 ═════════════ */
  const N_LAMP = 6;
  for (let i = 0; i < N_LAMP; i++) {
    const a = (i / N_LAMP) * Math.PI * 2 + Math.PI / N_LAMP;   // 避开正对的指示牌
    const lx = Math.cos(a) * LAMP_R, lz = Math.sin(a) * LAMP_R;
    const jh = r.range(-0.035, 0.035);                          // 柱高错落
    const base = 0.0;
    st(chisel(cylG(0.26, 0.30, 0.13, lx, base + 0.065, lz, 16), 0.012), 0.80);   // 柱础（基座深）
    st(chisel(cylG(0.115, 0.145, 0.58, lx, base + 0.13 + 0.29, lz, 12), 0.010), 1.00);  // 柱身
    st(chisel(cylG(0.23, 0.16, 0.08, lx, base + 0.13 + 0.58 + 0.04, lz, 12), 0.010), 1.22); // 斗（雕饰浅）
    /* 金：灯盘 + 灯盖 + 顶珠 */
    goldParts.push(cylG(0.235, 0.235, 0.045, lx, base + 0.78, lz, 14));         // 灯盘
    goldParts.push(coneG(0.205, 0.11, lx, base + 0.78 + 0.24 + jh * .2, lz, 12)); // 灯盖
    goldParts.push(cylG(0.035, 0.05, 0.07, lx, base + 0.78 + 0.325 + jh * .2, lz, 8)); // 顶珠
    /* 纸罩 */
    paperParts.push(cylG(0.155, 0.155, 0.235, lx, base + 0.78 + 0.135 + jh * .2, lz, 12));
  }
  /* 四方矮石碑：夹在灯柱之间，碑首起拱 */
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const sx = Math.cos(a) * LAMP_R, sz = Math.sin(a) * LAMP_R;
    const ry = -a;
    st(chisel(boxG(0.30, 0.10, 0.30, sx, 0.05, sz, ry), 0.010), 0.80);       // 碑座（基座深）
    st(chisel(boxG(0.26, 0.44, 0.13, sx, 0.32, sz, ry), 0.010), 1.00);       // 碑身
    const cap = new THREE.CylinderGeometry(0.13, 0.13, 0.13, 12, 1, false, -Math.PI / 2, Math.PI);
    cap.rotateX(Math.PI / 2);
    cap.rotateY(ry);
    cap.translate(sx, 0.545, sz);
    st(chisel(cap, 0.010), 1.20);                                             // 碑首（雕饰浅）
    /* 碑面刻字带（深色细线） */
    dk(boxG(0.17, 0.26, 0.012, sx + Math.cos(a) * 0.07, 0.34, sz - Math.sin(a) * 0.07, ry), 0.70);
  }
  /* 外圈符牌（12 枚）：深色底板 + 金框 + 浅色符字，嵌在法阵盘外圈带上。
     一块纯金片在夜里是一坨亮斑，看不出是"符"。 */
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 24;
    const px = Math.cos(a) * 1.66, pz = Math.sin(a) * 1.66, ry = -a;
    /* 底板 */
    dk(boxG(0.23, 0.018, 0.16, px, 0.058, pz, ry), 0.62);
    /* 金框：上下两条 */
    gd(boxG(0.24, 0.014, 0.022, px, 0.072, pz, ry), 1.06);
    gd(boxG(0.24, 0.014, 0.022, px, 0.050, pz, ry), 1.06);
    /* 金框：左右两条 */
    gd(boxG(0.022, 0.014, 0.16, px + Math.cos(a) * 0.105, 0.061, pz - Math.sin(a) * 0.105, ry), 1.06);
    gd(boxG(0.022, 0.014, 0.16, px - Math.cos(a) * 0.105, 0.061, pz + Math.sin(a) * 0.105, ry), 1.06);
    /* 符字：三笔 */
    gd(boxG(0.13, 0.012, 0.020, px, 0.068, pz, ry), 1.18);
    gd(boxG(0.016, 0.012, 0.075, px + Math.cos(a) * 0.028, 0.068, pz - Math.sin(a) * 0.028, ry), 1.18);
    gd(boxG(0.016, 0.012, 0.075, px - Math.cos(a) * 0.028, 0.068, pz + Math.sin(a) * 0.028, ry), 1.18);
  }
  /* 指示牌：立柱 + 柱础（石） */
  const signX = 0, signZ = SIGN_R;
  st(chisel(cylG(0.24, 0.28, 0.14, signX, 0.07, signZ, 14), 0.012), 0.80);
  st(chisel(cylG(0.085, 0.10, 1.34, signX, 0.14 + 0.67, signZ, 12), 0.010), 1.00);

  /* 指示牌匾：金框（并入金件一起合批） */
  const BW = 1.50, BH = 0.50, BY = 1.34;
  goldParts.push(boxG(BW + 0.10, 0.06, 0.09, signX, BY + BH / 2 + 0.03, signZ));
  goldParts.push(boxG(BW + 0.10, 0.06, 0.09, signX, BY - BH / 2 - 0.03, signZ));
  goldParts.push(boxG(0.06, BH + 0.12, 0.09, signX - BW / 2 - 0.03, BY, signZ));
  goldParts.push(boxG(0.06, BH + 0.12, 0.09, signX + BW / 2 + 0.03, BY, signZ));

  const matStoneDark = matClone(MAT.stoneDark, { color: 0x8a867c });
  const matGold = matClone(MAT.gold, { metalness: .86, roughness: .28, emissive: 0x2b1e07, emissiveIntensity: .75 });
  const matPaper = matClone(MAT.paper, {});
  matPaper.vertexColors = false;         // 纸罩几何没有 color 属性

  /* 逐件上色（色调档）再合批 —— 合完就分不出哪块是哪块了 */
  const toneOf = (g) => TONE.get(g) ?? 1;
  for (const g of stoneParts) {
    planarUV(g, 3.2);
    shade(g, { y0: 0, y1: 2.4, s0: .80, s1: 1.08, up: .26, jit: .06, tone: toneOf(g) });
  }
  const stoneMesh = meshOf(stoneParts, matStone);
  stoneMesh.name = 'pf-stone';
  group.add(stoneMesh);

  for (const g of darkParts) {
    planarUV(g, 3.2);
    shade(g, { y0: 0, y1: 2.4, s0: .70, s1: .96, up: .20, jit: .05, tone: toneOf(g) });
  }
  const darkMesh = meshOf(darkParts, matStoneDark);
  darkMesh.name = 'pf-stone-dark';
  group.add(darkMesh);

  for (const g of goldParts) {
    shade(g, { y0: 0, y1: 2.4, s0: .86, s1: 1.14, up: .30, jit: .04, tone: toneOf(g) });
  }
  const goldMesh = meshOf(goldParts, matGold);
  goldMesh.name = 'pf-gold';
  group.add(goldMesh);

  const paperMesh = meshOf(paperParts, matPaper);
  paperMesh.name = 'pf-paper';
  group.add(paperMesh);

  /* 指示牌纸面（canvas 贴图写「熊萌艺术馆 / 返回艺术馆」） */
  const sTex = signTex();
  const faceFront = new THREE.PlaneGeometry(BW, BH);
  faceFront.translate(signX, BY, signZ + 0.048);
  const faceBack = new THREE.PlaneGeometry(BW, BH);
  faceBack.rotateY(Math.PI);
  faceBack.translate(signX, BY, signZ - 0.048);
  const signMesh = new THREE.Mesh(
    mergeGeometries([nonIndexed(faceFront), nonIndexed(faceBack)], false),
    new THREE.MeshStandardMaterial({
      map: sTex, emissiveMap: sTex, emissive: 0xffd9a0, emissiveIntensity: .34,
      roughness: .92, metalness: 0, side: THREE.DoubleSide
    })
  );
  signMesh.name = 'pf-sign';
  signMesh.castShadow = false; signMesh.receiveShadow = true;
  group.add(signMesh);

  /* ═══ 5. 地面刻纹（加法混合的刻线层） ═════════════════ */
  const engGeo = new THREE.CircleGeometry(R - 0.02, 72);
  engGeo.rotateX(-Math.PI / 2);
  engGeo.translate(0, EMBED_Y, 0);
  const engMat = new THREE.MeshBasicMaterial({
    map: engraveTex(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: .72, side: THREE.DoubleSide
  });
  const engrave = new THREE.Mesh(engGeo, engMat);
  engrave.name = 'pf-engrave';
  engrave.renderOrder = 2;
  group.add(engrave);

  /* ═══ 6. 中心阵纹（缓慢旋转 + 呼吸） ═══════════════════ */
  const coreGeo = new THREE.CircleGeometry(0.92, 56);
  coreGeo.rotateX(-Math.PI / 2);
  coreGeo.translate(0, CORE_Y, 0);
  const coreMat = new THREE.MeshBasicMaterial({
    map: coreTex(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: .78, side: THREE.DoubleSide
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.name = 'pf-core';
  core.renderOrder = 3;
  group.add(core);

  /* ═══ 7. 半透明光幕（水波纹，缓慢起伏） ═════════════════ */
  const curGeo = new THREE.CylinderGeometry(R, R, CURTAIN_H, 56, 1, true);
  curGeo.translate(0, DECK_H + CURTAIN_H / 2, 0);
  const curMat = new THREE.MeshBasicMaterial({
    map: curtainTex(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, opacity: .16
  });
  const curtain = new THREE.Mesh(curGeo, curMat);
  curtain.name = 'pf-curtain';
  curtain.renderOrder = 4;
  group.add(curtain);

  /* ═══ 8. 中央光柱（MAT.portal 的淡青半透） ═════════════ */
  const colGeo = new THREE.CylinderGeometry(0.20, 0.34, COL_H, 28, 1, true);
  colGeo.translate(0, DECK_H + COL_H / 2, 0);
  const colMat = MAT.portal.clone();          // 克隆一份，免得动到共享材质
  colMat.opacity = .42;
  colMat.depthWrite = false;
  const column = new THREE.Mesh(colGeo, colMat);
  column.name = 'pf-column';
  column.renderOrder = 5;
  group.add(column);

  /* ═══ 9. 接地阴影：铺地外沿一圈软影 ═══════════════════════
     影落在"铺地边缘"上，法阵就被"焊"在地面上了。
     中心那一圈被法阵盘盖住看不见 —— 正好省掉。 */
  {
    const ring = aoRingGeo(2.30, 3.70, .50, AO_Y, 40, 0.85);
    /* 柱脚 / 碑座 / 牌柱脚的接触影：core/ao.js 的 aoBatch，
       和外圈那一圈软影合成同一个 mesh（MultiplyBlending 是相乘的，
       分成两个 mesh 反而会叠出黑块）。 */
    const pts = [];
    for (let i = 0; i < N_LAMP; i++) {
      const a = (i / N_LAMP) * Math.PI * 2 + Math.PI / N_LAMP;
      pts.push({ x: Math.cos(a) * LAMP_R, z: Math.sin(a) * LAMP_R, r: 0.42, s: .50 });
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      pts.push({ x: Math.cos(a) * LAMP_R, z: Math.sin(a) * LAMP_R, r: 0.36, s: .46 });
    }
    pts.push({ x: 0, z: SIGN_R, r: 0.44, s: .50 });
    const patches = aoBatch(pts, aoMaterial());
    for (const g of patches) g.translate(0, 0.006, 0);
    const geo = mergeGeometries([ring, ...patches], false);
    const aoMesh = new THREE.Mesh(geo, aoMaterial());
    aoMesh.name = 'pf-ao';
    aoMesh.renderOrder = 2;
    aoMesh.castShadow = false;
    aoMesh.receiveShadow = false;
    aoMesh.matrixAutoUpdate = false;
    group.add(aoMesh);
  }

  /* ═══ 10. 动画 ═══════════════════════════════════════════ */
  group.userData.update = (t, dt) => {
    /* 中心阵纹：慢转 + 呼吸 */
    core.rotation.y = t * 0.22;
    coreMat.opacity = .66 + .20 * Math.sin(t * 1.25);
    /* 地面刻纹：反向慢转 + 淡呼吸 */
    engrave.rotation.y = -t * 0.055;
    engMat.opacity = .64 + .14 * Math.sin(t * 0.72 + 1.1);
    /* 光幕：慢转 + 纹样上涌 + 明暗起伏 */
    curtain.rotation.y = t * 0.085;
    if (curMat.map) { curMat.map.offset.y = -t * 0.055; curMat.map.offset.x = Math.sin(t * 0.21) * 0.04; }
    curMat.opacity = .12 + .07 * (0.5 + 0.5 * Math.sin(t * 0.95));
    /* 光柱：亮度呼吸 */
    colMat.opacity = .30 + .16 * (0.5 + 0.5 * Math.sin(t * 1.6));
    column.scale.set(1 + .04 * Math.sin(t * 1.6), 1, 1 + .04 * Math.sin(t * 1.6));
  };

  group.userData.portal = PORTALS[0];
  group.userData.drawCalls = 11;
  group.userData.deckDiameter = R * 2;
  return group;
}
