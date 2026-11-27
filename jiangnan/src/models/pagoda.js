/* 江南古村 · 宝塔（七级方塔）
   ------------------------------------------------------------------
   形制：须弥座（圭角—束腰—上枋—台面）+ 七层楼阁式塔身 + 塔刹（覆钵—相轮—宝珠）
   尺度：台面高 1.50m，砖墙层高 2.60m，每层节奏 3.05m
         塔身顶 = 1.50 + 7×3.05 = 22.85m ；塔刹顶 ≈ 25.6m
   收分：一层墙身 7.00m，每层收进 8%（0.92），七层顶 4.24m
   每层竖向（自本层墙脚起算）：
     0.00–2.60  砖身（券门 / 券窗 + 砖缝带）
     2.60–2.70  墙帽
     2.70–2.95  斗拱（出挑 0.44m）
     2.93–3.05  平座（石栏杆）
     3.02→2.58  瓦面（内高外低、反宇凹曲，檐角起翘 0.45m）
   朝向：rot = 0，正南北向；南面（+z）为券门与石阶，北面为窗，东西两面为窗
   材质：MAT.stone / MAT.stoneDark / MAT.wall / MAT.tile / MAT.wood /
         MAT.gold / MAT.brass —— 合批成 7 个 mesh（7 个 draw call）
   随机性：只用 makeRng(seed ^ 0x77)，同 seed 必得同一座塔 */
import * as THREE from 'three';
import { meshOf, paramSurface } from '../core/geo.js';
import { MAT, initMaterials } from '../core/materials.js';
import { makeRng } from '../core/rng.js';

/* ── 尺寸常量 ─────────────────────────────────────────────── */
const LEVELS = 7;
const W0 = 7.0;            // 一层墙身外边长
const SHRINK = 0.92;       // 每层收进 8%
const WALL_H = 2.60;       // 砖墙层高
const TH = 0.42;           // 墙厚
const PITCH = 3.05;        // 每层总节奏（墙 + 檐 + 平座）
const PED_H = 1.50;        // 须弥座总高
const PLAT_SIZE = 24;      // 塔前石铺地边长
const PLAT_H = 0.05;       // 铺地比地面高 5cm
const EAVE_OUT = 1.75;     // 瓦面外挑
const BALC_OUT = 0.80;     // 平座外挑
const UPTURN = 0.45;       // 檐角起翘

/* ── 几何小工具 ───────────────────────────────────────────── */
function boxG(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/* 两点之间的方料（自带"上"方向，避免旋转后截面乱翻） */
function barG(from, to, w, h) {
  const a = new THREE.Vector3(from[0], from[1], from[2]);
  const b = new THREE.Vector3(to[0], to[1], to[2]);
  const dir = b.clone().sub(a);
  const len = Math.max(1e-4, dir.length());
  dir.normalize();
  let side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  side.normalize();
  const uu = new THREE.Vector3().crossVectors(dir, side).normalize();
  const g = new THREE.BoxGeometry(w, h, len);
  const m = new THREE.Matrix4().makeBasis(side, uu, dir);
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

/* 圆柱：沿 dir 摆放 */
function cylG(r, len, at, dir, seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  g.applyQuaternion(q);
  g.translate(at[0], at[1], at[2]);
  return g;
}

/* 方形轮廓按周长参数取点：u∈[0,1)，u=0/.25/.5/.75 是四个角 */
function squarePt(R, u) {
  u = u - Math.floor(u);
  const s = u * 4;
  const k = Math.floor(s), t = s - k;
  const a = -R + 2 * R * t;
  if (k === 0) return [a, -R];
  if (k === 1) return [R, a];
  if (k === 2) return [-a, R];
  return [-R, -a];
}

/* 该周长参数处朝外的法线（东西南北四面） */
function outward(u) {
  const k = Math.floor((u - Math.floor(u)) * 4) % 4;
  return k === 0 ? [0, -1] : k === 1 ? [1, 0] : k === 2 ? [0, 1] : [-1, 0];
}

/* 瓦面取点：v=0 内沿 → v=1 檐口；角部起翘 */
function eavePt(u, v, E) {
  const [xi, zi] = squarePt(E.ri, u);
  const [xo, zo] = squarePt(E.ro, u);
  let d = Math.abs(u - Math.round(u * 4) / 4);
  d = Math.min(d, 1 - d);
  const cw = 1 - Math.min(1, d / 0.09);
  const y = E.yI + (E.yT - E.yI) * Math.pow(v, 1.8) + E.up * cw * cw * Math.pow(v, 2.2);
  return [xi + (xo - xi) * v, y, zi + (zo - zi) * v];
}

/* 券洞墙板：矩形板挖一个上端半圆的洞 */
function archPanel(len, h, thick, op) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0); s.lineTo(len / 2, h); s.lineTo(-len / 2, h); s.closePath();
  const r = op.w / 2;
  const straight = Math.max(0.05, op.h - r);
  const p = new THREE.Path();
  p.moveTo(-r, op.base);
  p.lineTo(-r, op.base + straight);
  p.absarc(0, op.base + straight, r, Math.PI, 0, true);
  p.lineTo(r, op.base);
  p.closePath();
  s.holes.push(p);
  return new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 10 });
}

/* 某高度处券洞的半宽（拱顶收窄） */
function holeHalf(op, yc) {
  if (yc < op.base || yc > op.base + op.h) return 0;
  const r = op.w / 2;
  const st = op.base + Math.max(0.05, op.h - r);
  if (yc <= st) return r;
  const dy = yc - st;
  const v = r * r - dy * dy;
  return v > 0 ? Math.sqrt(v) : 0;
}

export function build(layout) {
  const group = new THREE.Group();
  group.name = 'model-pagoda';
  const tw = layout && layout.tower;
  if (!tw) return group;                       // 没有宝塔就什么都不做

  initMaterials();
  const seedNum = (typeof layout.seed === 'number')
    ? layout.seed
    : ((layout.landmark && layout.landmark.seed) || 0);
  const r = makeRng((seedNum | 0) ^ 0x77);

  const G = { stone: [], dark: [], brick: [], tile: [], wood: [], gold: [], brass: [] };
  const P = (k, g) => G[k].push(g);

  /* ═══ 1. 石铺地（大平面，比地面高 0.05m） ═══════════════ */
  P('stone', boxG(PLAT_SIZE, PLAT_H, PLAT_SIZE, 0, PLAT_H / 2, 0));
  const ED = PLAT_SIZE / 2;
  P('dark', boxG(PLAT_SIZE + 0.4, 0.16, 0.30, 0, 0.08, -(ED + 0.05)));
  P('dark', boxG(PLAT_SIZE + 0.4, 0.16, 0.30, 0, 0.08, ED + 0.05));
  P('dark', boxG(0.30, 0.16, PLAT_SIZE + 0.4, -(ED + 0.05), 0.08, 0));
  P('dark', boxG(0.30, 0.16, PLAT_SIZE + 0.4, ED + 0.05, 0.08, 0));

  /* ═══ 2. 须弥座：圭角 → 束腰 → 上枋 → 台面 ═════════════ */
  const GUA = 9.80, SHU = 9.00, SHANG = 9.60, TAI = 9.20;
  P('stone', boxG(GUA, 0.50, GUA, 0, 0.25, 0));                     // 圭角
  P('stone', boxG(GUA + 0.14, 0.12, GUA + 0.14, 0, 0.56, 0));      // 圭角压边
  P('dark', boxG(SHU, 0.32, SHU, 0, 0.78, 0));                      // 束腰 0.62~0.94
  /* 束腰雕花带：一圈小方块 */
  {
    const n = 76;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const [x, z] = squarePt(SHU / 2, u);
      const od = outward(u);
      const d = 0.10 + (r() - 0.5) * 0.03;
      const g = boxG(0.30, 0.22, d, 0, 0, 0);
      g.rotateY(Math.atan2(od[0], od[1]));          // 薄面向外，宽面沿墙面
      g.translate(x + od[0] * (d / 2 - 0.02), 0.78, z + od[1] * (d / 2 - 0.02));
      P('dark', g);
    }
  }
  P('stone', boxG(SHANG, 0.34, SHANG, 0, 1.11, 0));                // 上枋 0.94~1.28
  P('stone', boxG(TAI, 0.22, TAI, 0, 1.39, 0));                    // 台面 1.28~1.50
  P('dark', boxG(TAI + 0.10, 0.06, TAI + 0.10, 0, 1.31, 0));       // 台面束带

  /* ═══ 3. 南面石阶 + 两侧矮石栏（望柱 + 栏板） ═══════════ */
  {
    const sw = 2.80, steps = 8, tread = 0.38;
    const rise = (PED_H - PLAT_H) / steps;
    const z0 = TAI / 2;
    for (let i = 0; i < steps; i++) {
      const top = PED_H - rise * (i + 1);
      const z = z0 + tread * (i + 0.5);
      P('stone', boxG(sw, top - PLAT_H, tread, 0, PLAT_H + (top - PLAT_H) / 2, z));
      if (top - 0.07 > PLAT_H) P('dark', boxG(sw, 0.07, 0.14, 0, top - 0.035, z + tread / 2 - 0.07));
    }
    for (const sx of [-1, 1]) {
      const x = sx * (sw / 2 + 0.24);
      const posts = [];
      for (let k = 0; k <= 8; k += 2) {
        const z = z0 + tread * k;
        const base = k === 0 ? PED_H : (k >= 8 ? PLAT_H : PED_H - rise * k);
        const tall = (k === 0 || k === 8);
        const h = tall ? 0.80 : 0.62;
        const w = tall ? 0.18 : 0.13;
        P('stone', boxG(w, h, w, x, base + h / 2, z));
        if (tall) P('dark', boxG(w + 0.09, 0.10, w + 0.09, x, base + h + 0.05, z));  // 望柱头
        posts.push([x, base + h, z]);
      }
      P('stone', barG(posts[0], posts[posts.length - 1], 0.15, 0.09));               // 扶手
      P('stone', barG(
        [posts[0][0], posts[0][1] - 0.30, posts[0][2]],
        [posts[posts.length - 1][0], posts[posts.length - 1][1] - 0.30, posts[posts.length - 1][2]],
        0.09, 0.07));                                                                  // 栏板横杆
    }
  }

  /* ═══ 4. 七层塔身 ═══════════════════════════════════════ */
  for (let i = 0; i < LEVELS; i++) {
    const w = W0 * Math.pow(SHRINK, i);
    const hw = w / 2;
    const y0 = PED_H + i * PITCH;

    /* 券洞尺寸（每层微差，由 seed 决定） */
    const door = { w: 1.20 + (r() - 0.5) * 0.10, h: 2.10, base: 0.04 };
    const winF = { w: 1.00 + (r() - 0.5) * 0.08, h: 1.60, base: 0.95 };
    const winB = { w: 0.95 + (r() - 0.5) * 0.08, h: 1.50, base: 1.00 };
    const winS = { w: 0.85 + (r() - 0.5) * 0.08, h: 1.35, base: 1.10 };

    /* 四面：南(门) / 东(窗) / 北(窗) / 西(窗) */
    const faces = [
      { len: w, rotY: 0, ox: 0, oz: hw - TH, op: i === 0 ? door : winF, isDoor: i === 0 },
      { len: w - 2 * TH, rotY: Math.PI / 2, ox: hw - TH, oz: 0, op: winS, isDoor: false },
      { len: w, rotY: Math.PI, ox: 0, oz: -(hw - TH), op: winB, isDoor: false },
      { len: w - 2 * TH, rotY: -Math.PI / 2, ox: -(hw - TH), oz: 0, op: winS, isDoor: false },
    ];

    for (const f of faces) {
      /* 砖身板（带券洞） */
      const panel = archPanel(f.len, WALL_H, TH, f.op);
      panel.rotateY(f.rotY); panel.translate(f.ox, y0, f.oz);
      P('brick', panel);

      /* 砖缝带：水平砌层，遇券洞断开 */
      for (let yc = 0.16; yc <= WALL_H - 0.16; yc += 0.30) {
        const hw2 = holeHalf(f.op, yc);
        const segs = hw2 > 0.02
          ? [[-f.len / 2, -hw2], [hw2, f.len / 2]]
          : [[-f.len / 2, f.len / 2]];
        for (const [a, b] of segs) {
          if (b - a < 0.06) continue;
          const g = boxG(b - a, 0.05, 0.03, (a + b) / 2, yc, 0.015);
          g.rotateY(f.rotY); g.translate(f.ox, y0, f.oz);
          P('brick', g);
        }
      }

      /* 洞内暗木衬板（门扇 / 窗背） */
      const back = boxG(f.op.w + 0.18, f.op.h + 0.06, 0.06, 0, f.op.base + f.op.h / 2 + 0.03, -0.28);
      back.rotateY(f.rotY); back.translate(f.ox, y0, f.oz);
      P('wood', back);

      /* 窗上木格 */
      if (!f.isDoor) {
        for (const lx of [-f.op.w * 0.24, f.op.w * 0.24]) {
          const g = boxG(0.05, f.op.h * 0.60, 0.05, lx, f.op.base + f.op.h * 0.42, -0.24);
          g.rotateY(f.rotY); g.translate(f.ox, y0, f.oz);
          P('wood', g);
        }
      }

      /* 斗拱：连续檐枋 + 排布斗栱 */
      const zhu = boxG(f.len, 0.12, 0.18, 0, 2.92, 0.09);
      zhu.rotateY(f.rotY); zhu.translate(f.ox, y0, f.oz);
      P('wood', zhu);
      const nB = Math.max(3, Math.round(f.len / 1.05));
      for (let k = 0; k < nB; k++) {
        const bx = -f.len / 2 + f.len * (k + 0.5) / nB;
        const parts = [
          boxG(0.22, 0.13, 0.24, bx, 2.78, 0.12),   // 斗
          boxG(0.15, 0.10, 0.44, bx, 2.90, 0.22),    // 出挑拱
          boxG(0.52, 0.10, 0.16, bx, 2.90, 0.08),    // 横拱
        ];
        for (const g of parts) { g.rotateY(f.rotY); g.translate(f.ox, y0, f.oz); P('wood', g); }
      }
    }

    /* 墙帽 */
    P('brick', boxG(w + 0.16, 0.10, w + 0.16, 0, y0 + WALL_H + 0.05, 0));

    /* ── 檐：瓦面 + 瓦垄 + 角脊 + 檐板 + 瓦当 + 檐椽 ── */
    const E = { ri: hw + 0.10, ro: hw + EAVE_OUT, yI: y0 + 3.02, yT: y0 + 2.58, up: UPTURN };
    P('tile', paramSurface((u, v) => eavePt(u, v, E), 132, 8));

    /* 瓦垄（一片片筒瓦，沿坡向排） */
    const nR = Math.max(16, Math.round(4 * (2 * hw) / 0.34));
    for (let k = 0; k < nR; k++) {
      const u = (k + 0.5) / nR;
      const a = eavePt(u, 0.03, E), b = eavePt(u, 0.985, E);
      a[1] += 0.02; b[1] += 0.02;
      P('tile', barG(a, b, 0.11, 0.05));
    }
    /* 角脊：盖住四角起翘的转折 */
    for (const u of [0, 0.25, 0.5, 0.75]) {
      const a = eavePt(u, 0.02, E), b = eavePt(u, 0.99, E);
      a[1] += 0.05; b[1] += 0.05;
      P('tile', barG(a, b, 0.17, 0.14));
    }
    /* 檐板 + 瓦当 */
    const nB2 = 8;
    for (let k = 0; k < 4 * nB2; k++) {
      const a = eavePt(k / (4 * nB2), 1.0, E), b = eavePt((k + 1) / (4 * nB2), 1.0, E);
      a[1] -= 0.055; b[1] -= 0.055;
      P('tile', barG(a, b, 0.09, 0.12));
    }
    for (let k = 0; k < nR; k++) {
      const u = (k + 0.5) / nR;
      const p = eavePt(u, 1.0, E);
      const od = outward(u);
      P('tile', cylG(0.075, 0.07, [p[0] + od[0] * 0.03, p[1] - 0.02, p[2] + od[1] * 0.03], od, 8));
    }
    /* 檐椽：托在瓦面下面的放射椽子 */
    const nF = Math.max(12, Math.round(4 * (2 * hw) / 0.55));
    for (let k = 0; k < nF; k++) {
      const u = (k + 0.5) / nF;
      const a = eavePt(u, 0.04, E), b = eavePt(u, 0.97, E);
      a[1] -= 0.06; b[1] -= 0.04;
      P('wood', barG(a, b, 0.07, 0.07));
    }

    /* ── 平座 + 勾栏 ── */
    P('stone', boxG(w + 2 * BALC_OUT, 0.12, w + 2 * BALC_OUT, 0, y0 + 2.99, 0));
    {
      const rr = hw + BALC_OUT - 0.08;
      const sides = [
        { a: [-rr, -rr], b: [rr, -rr] },
        { a: [rr, -rr], b: [rr, rr] },
        { a: [rr, rr], b: [-rr, rr] },
        { a: [-rr, rr], b: [-rr, -rr] },
      ];
      const done = [];
      for (const s of sides) {
        const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        const n = Math.max(3, Math.round(len / 0.72));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const x = s.a[0] + (s.b[0] - s.a[0]) * t;
          const z = s.a[1] + (s.b[1] - s.a[1]) * t;
          if (done.some(p => Math.abs(p[0] - x) < 0.02 && Math.abs(p[1] - z) < 0.02)) continue;
          done.push([x, z]);
          P('wood', boxG(0.11, 0.52, 0.11, x, y0 + 3.31, z));
        }
        P('wood', barG([s.a[0], y0 + 3.52, s.a[1]], [s.b[0], y0 + 3.52, s.b[1]], 0.07, 0.09));
        P('wood', barG([s.a[0], y0 + 3.28, s.a[1]], [s.b[0], y0 + 3.28, s.b[1]], 0.05, 0.06));
      }
    }

    /* ── 檐角挂铃 ── */
    for (const u of [0, 0.25, 0.5, 0.75]) {
      const p = eavePt(u, 1.0, E);
      P('brass', cylG(0.022, 0.20, [p[0], p[1] - 0.16, p[2]], [0, 1, 0], 6));
      const bell = new THREE.SphereGeometry(0.13, 10, 8);
      bell.translate(p[0], p[1] - 0.34, p[2]);
      P('brass', bell);
    }
  }

  /* ═══ 5. 塔刹：莲座 → 覆钵 → 相轮 → 宝盖 → 宝珠 ═══════ */
  const topY = PED_H + LEVELS * PITCH;          // 22.85
  P('stone', cylG(0.95, 0.14, [0, topY + 0.07, 0], [0, 1, 0], 18));
  P('stone', cylG(0.74, 0.10, [0, topY + 0.19, 0], [0, 1, 0], 18));
  const bowlBase = topY + 0.24;
  {
    const prof = [[0.30, 0], [0.38, 0.10], [0.50, 0.28], [0.60, 0.48], [0.64, 0.66], [0.60, 0.80], [0.52, 0.86]]
      .map(q => new THREE.Vector2(q[0], q[1]));
    const bowl = new THREE.LatheGeometry(prof, 20);
    bowl.translate(0, bowlBase, 0);
    P('gold', bowl);
  }
  P('gold', cylG(0.055, 1.95, [0, bowlBase + 0.55, 0], [0, 1, 0], 8));       // 刹杆
  for (let k = 0; k < 7; k++) {
    const rr = 0.50 - k * 0.045;
    P('gold', cylG(rr, 0.075, [0, bowlBase + 1.02 + k * 0.115, 0], [0, 1, 0], 14));  // 相轮
  }
  P('gold', cylG(0.30, 0.07, [0, bowlBase + 1.87, 0], [0, 1, 0], 14));       // 宝盖
  P('gold', cylG(0.13, 0.09, [0, bowlBase + 1.97, 0], [0, 1, 0], 10));       // 莲座
  const jewel = new THREE.SphereGeometry(0.27, 14, 10);
  jewel.translate(0, bowlBase + 2.25, 0);
  P('gold', jewel);
  const flame = new THREE.ConeGeometry(0.10, 0.40, 8);
  flame.translate(0, bowlBase + 2.58, 0);
  P('gold', flame);
  /* 刹上小铃 */
  for (let k = 0; k < 4; k++) {
    const u = (k + 0.5) / 4;
    const [x, z] = squarePt(0.60, u);
    const bell = new THREE.SphereGeometry(0.085, 8, 6);
    bell.translate(x, bowlBase + 0.62, z);
    P('brass', bell);
  }

  /* ═══ 6. 合批出 mesh ═══════════════════════════════════ */
  group.add(meshOf(G.stone, MAT.stone));
  group.add(meshOf(G.dark, MAT.stoneDark));
  group.add(meshOf(G.brick, MAT.wall));
  group.add(meshOf(G.tile, MAT.tile));
  group.add(meshOf(G.wood, MAT.wood));
  group.add(meshOf(G.gold, MAT.gold));
  group.add(meshOf(G.brass, MAT.brass));

  group.position.set(tw.x, 0, tw.z);            // 落在 layout.tower 上，rot = 0（正南北向）
  return group;
}
