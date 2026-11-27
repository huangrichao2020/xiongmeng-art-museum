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

/* ── 尺寸常量 ─────────────────────────────────────────────── */
const R = 1.80;              // 法阵半径 → 直径 3.60m（硬指标）
const DECK_H = 0.05;         // 石台厚度：y 0 → 0.05，贴地
const EMBED_Y = 0.052;       // 刻纹层
const CORE_Y = 0.056;        // 中心阵纹层
const LAMP_R = 2.02;         // 石灯柱圈半径（法阵外一圈）
const SIGN_R = 2.55;         // 指示牌半径（朝路一侧）
const CURTAIN_H = 2.30;      // 光幕高
const COL_H = 2.60;          // 光柱高

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
  ring(0.965, 7, .95, '#8ff0dc');
  ring(0.935, 2.5, .55, '#f2d489');
  ring(0.780, 5, .80, '#8ff0dc');
  ring(0.735, 2.0, .45, '#f2d489');
  ring(0.620, 4, .70, '#8ff0dc');
  ring(0.560, 2.0, .40, '#8ff0dc');
  ring(0.430, 3.5, .55, '#f2d489');

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
  g.strokeStyle = '#ffeec0';
  sealGlyph(g, C, C, 150, 3);
  g.strokeStyle = 'rgba(255,238,192,.55)';
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

  /* ═══ 2. 法阵石台（直径精确 3.60m，y 0 → 0.05） ═══════ */
  const deck = new THREE.CylinderGeometry(R, R, DECK_H, 72, 1);
  deck.translate(0, DECK_H / 2, 0);
  const deckMesh = new THREE.Mesh(deck, MAT.stone);
  deckMesh.name = 'pf-deck';
  deckMesh.castShadow = true; deckMesh.receiveShadow = true;
  group.add(deckMesh);

  /* ═══ 3. 六根石灯柱（柱础 / 柱身 / 斗）+ 指示牌立柱 ═══ */
  const stoneParts = [];
  const goldParts = [];
  const paperParts = [];
  const N_LAMP = 6;
  for (let i = 0; i < N_LAMP; i++) {
    const a = (i / N_LAMP) * Math.PI * 2 + Math.PI / N_LAMP;   // 避开正对的指示牌
    const lx = Math.cos(a) * LAMP_R, lz = Math.sin(a) * LAMP_R;
    const jh = r.range(-0.035, 0.035);                          // 柱高错落
    const base = 0.0;
    stoneParts.push(cylG(0.28, 0.32, 0.13, lx, base + 0.065, lz, 16));          // 柱础
    stoneParts.push(cylG(0.115, 0.145, 0.58, lx, base + 0.13 + 0.29, lz, 12));  // 柱身
    stoneParts.push(cylG(0.23, 0.16, 0.08, lx, base + 0.13 + 0.58 + 0.04, lz, 12)); // 斗
    /* 金：灯盘 + 灯盖 + 顶珠 */
    goldParts.push(cylG(0.235, 0.235, 0.045, lx, base + 0.78, lz, 14));         // 灯盘
    goldParts.push(coneG(0.205, 0.11, lx, base + 0.78 + 0.24 + jh * .2, lz, 12)); // 灯盖
    goldParts.push(cylG(0.035, 0.05, 0.07, lx, base + 0.78 + 0.325 + jh * .2, lz, 8)); // 顶珠
    /* 纸罩 */
    paperParts.push(cylG(0.155, 0.155, 0.235, lx, base + 0.78 + 0.135 + jh * .2, lz, 12));
  }
  /* 外圈符牌（12 枚小金片） */
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 24;
    goldParts.push(boxG(0.17, 0.035, 0.11, Math.cos(a) * 1.92, 0.055, Math.sin(a) * 1.92, -a));
  }
  /* 指示牌：立柱 + 柱础（石） */
  const signX = 0, signZ = SIGN_R;
  stoneParts.push(cylG(0.24, 0.28, 0.14, signX, 0.07, signZ, 14));
  stoneParts.push(cylG(0.085, 0.10, 1.34, signX, 0.14 + 0.67, signZ, 12));

  /* 指示牌匾：金框（并入金件一起合批） */
  const BW = 1.50, BH = 0.50, BY = 1.34;
  goldParts.push(boxG(BW + 0.10, 0.06, 0.09, signX, BY + BH / 2 + 0.03, signZ));
  goldParts.push(boxG(BW + 0.10, 0.06, 0.09, signX, BY - BH / 2 - 0.03, signZ));
  goldParts.push(boxG(0.06, BH + 0.12, 0.09, signX - BW / 2 - 0.03, BY, signZ));
  goldParts.push(boxG(0.06, BH + 0.12, 0.09, signX + BW / 2 + 0.03, BY, signZ));

  const stoneMesh = meshOf(stoneParts, MAT.stone);
  stoneMesh.name = 'pf-stone';
  group.add(stoneMesh);

  const goldMesh = meshOf(goldParts, MAT.gold);
  goldMesh.name = 'pf-gold';
  group.add(goldMesh);

  const paperMesh = meshOf(paperParts, MAT.paper);
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
    depthWrite: false, opacity: .70, side: THREE.DoubleSide
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
    depthWrite: false, opacity: .80, side: THREE.DoubleSide
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

  /* ═══ 9. 动画 ═══════════════════════════════════════════ */
  group.userData.update = (t, dt) => {
    /* 中心阵纹：慢转 + 呼吸 */
    core.rotation.y = t * 0.22;
    coreMat.opacity = .62 + .24 * Math.sin(t * 1.25);
    /* 地面刻纹：反向慢转 + 淡呼吸 */
    engrave.rotation.y = -t * 0.055;
    engMat.opacity = .55 + .14 * Math.sin(t * 0.72 + 1.1);
    /* 光幕：慢转 + 纹样上涌 + 明暗起伏 */
    curtain.rotation.y = t * 0.085;
    if (curMat.map) { curMat.map.offset.y = -t * 0.055; curMat.map.offset.x = Math.sin(t * 0.21) * 0.04; }
    curMat.opacity = .12 + .07 * (0.5 + 0.5 * Math.sin(t * 0.95));
    /* 光柱：亮度呼吸 */
    colMat.opacity = .30 + .16 * (0.5 + 0.5 * Math.sin(t * 1.6));
    column.scale.set(1 + .04 * Math.sin(t * 1.6), 1, 1 + .04 * Math.sin(t * 1.6));
  };

  group.userData.portal = PORTALS[0];
  group.userData.drawCalls = 9;
  group.userData.deckDiameter = R * 2;
  return group;
}
