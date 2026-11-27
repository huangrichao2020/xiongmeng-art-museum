/* 江南古村 · 民居模型（白墙黛瓦 / 马头墙 / 木门木窗）
   ------------------------------------------------------------------
   契约要点（随新参数更新）：
   ① 格长 layout.cell = 3.2m，网格 80×80（256m×256m，原点居中）。
      房身恒占 2×2 格 → 可建 6.4×6.4m；实际房身：
        面宽 W = w*cell - 0.8 ≈ 5.6m（两间）
        进深 D = d*cell - 1.2 ≈ 5.2m
      屋檐/山墙在此基础上外挑，门前留 0.6~1m 檐口挑向街面。
      尺寸一律用 layout.cell 乘出，不写死 2.5。
   ② layout.houses[i].x / z 已是世界坐标（±128m），直接用，不再乘 cell / 不加偏移。
   ③ 门在建筑本地 -z。layout.houses[i].door 给出的是「街面所在方向」
      （'E' = 街在东边 → 门要朝 +x）。本地 -z 绕 Y 转 θ 后指向
      (-sin θ, 0, -cos θ)，反解：N→0, S→π, E→-π/2, W→+π/2。
      这与 layout 的 rot = DIR_ROT[dir]（N0/E+π/2/Sπ/W-π/2）恰好等价于 θ = -rot，
      所以门一定正对街面。没有 door 字段时退回 -rot。
   ④ 纯函数：只读 layout；随机性走 makeRng(layout.seed ^ 0x11)，
      每栋房按序号再派生独立种子（同 seed 必得同一张图）。
   ⑤ 同材质构件全部合并，全模块 ≈ 14 个 draw call。
*/
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { initMaterials, MAT } from '../core/materials.js';
import { gableRoofGeo, steppedGableGeo, plinthGeo, doorGeo, windowFrameGeo, mergeGeometries, fixUpNormals, nonIndexed } from '../core/geo.js';

const CELL_FALLBACK = 3.2;   // layout.cell 缺失时的兜底
const WALL_T = 0.17;         // 墙体厚
const GABLE_T = 0.26;        // 马头墙厚
const PLINTH_H = 0.36;       // 灰砖勒脚高

/* 门朝向角（由 door 字段反解，见头注 ③） */
const DOOR_THETA = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };

/* ── 基础几何小工具 ─────────────────────────────────────────── */
function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function cyl(rt, rb, h, seg, x, y, z, rx = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/* ── 材质桶：key → 几何数组（同材质最后合成一个大 mesh）──────── */
function put(buckets, key, geo, mtx) {
  const g = nonIndexed(geo);
  if (mtx) g.applyMatrix4(mtx);
  let arr = buckets.get(key);
  if (!arr) { arr = []; buckets.set(key, arr); }
  arr.push(g);
}

/* ── 带洞口的墙板（墙底 y=0，墙厚沿 z 居中，洞 = {u,v,w,h}）──── */
function wallWithHoles(w, h, t, holes) {
  const parts = [];
  const xs = new Set([-w / 2, w / 2]);
  for (const o of holes) { xs.add(o.u - o.w / 2); xs.add(o.u + o.w / 2); }
  const xa = [...xs].sort((a, b) => a - b);
  for (let i = 0; i < xa.length - 1; i++) {
    const x0 = xa[i], x1 = xa[i + 1];
    const sw = x1 - x0;
    if (sw < 1e-5) continue;
    const cx = (x0 + x1) / 2;
    const cut = holes
      .filter(o => o.u - o.w / 2 < cx + 1e-6 && o.u + o.w / 2 > cx - 1e-6)
      .sort((a, b) => a.v - b.v);
    let y = 0;
    for (const o of cut) {
      if (o.v > y + 1e-5) parts.push(box(sw, o.v - y, t, cx, y + (o.v - y) / 2, 0));
      y = Math.max(y, o.v + o.h);
    }
    if (h > y + 1e-5) parts.push(box(sw, h - y, t, cx, y + (h - y) / 2, 0));
  }
  return mergeGeometries(parts.map(nonIndexed), false);
}

/* ── 马头墙阶梯顶轮廓（与 core/steppedGableGeo 的形状一致）───── */
function stepProfile(len, h, steps) {
  const half = len / 2;
  const seg = h * .45 / steps;
  let x = -half, y = h * .55;
  const pts = [[-half, y]];
  for (let i = 0; i < steps; i++) {
    pts.push([x + half / steps * .55, y]);
    pts.push([x + half / steps * .55, y + seg * .55]);
    pts.push([x + half / steps, y + seg * .55]);
    y += seg * .55; x += half / steps;
  }
  pts.push([half, y]);
  return pts;
}

/* 黛瓦压顶：沿阶梯轮廓铺一条瓦脊 */
function copingOf(pts, mapZ, xc, thick, copT, out) {
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], ay = pts[i][1];
    const bx = pts[i + 1][0], by = pts[i + 1][1];
    const az = mapZ(ax), bz = mapZ(bx);
    if (Math.abs(by - ay) < 1e-6) {                       // 踏面
      const len = Math.abs(bz - az);
      if (len < 1e-4) continue;
      out.push(box(len, copT, thick + .06, xc, ay + copT / 2, (az + bz) / 2));
    } else {                                              // 踢面
      const hh = Math.abs(by - ay);
      out.push(box(thick + .06, hh, copT, xc, (ay + by) / 2, (az + bz) / 2));
    }
  }
}

/* ── 房身尺寸（纯函数，可单独测试）─────────────────────────── */
export function houseDims(h, cell) {
  const c = cell || CELL_FALLBACK;
  const mx = Math.min(0.8, c * 0.25);      // 两侧余量
  const mz = Math.min(1.2, c * 0.375);     // 前后余量（门前留檐口）
  const W = Math.max(2.0, (h.w || 2) * c - mx);
  const D = Math.max(2.0, (h.d || 2) * c - mz);
  return { W, D };
}

/* ══════════════════════════════════════════════════════════════
   单栋民居
   ══════════════════════════════════════════════════════════════ */
function buildHouse(h, idx, buckets, baseSeed, cell) {
  const rng = makeRng((baseSeed ^ Math.imul(idx + 1, 0x9E3779B1)) | 0);
  /* 门朝向：本地 -z，θ 由 door 反解（见头注 ③） */
  const theta = (h.door && DOOR_THETA[h.door] !== undefined) ? DOOR_THETA[h.door] : -(h.rot || 0);
  const M4 = new THREE.Matrix4().makeRotationY(theta).setPosition(h.x || 0, 0, h.z || 0);
  const P = (key, geo) => put(buckets, key, geo, M4);

  const kind = h.kind || 'common';
  const style = (((h.style | 0) % 4) + 4) % 4;
  const floors = kind === 'rich' ? 2 : (h.floors >= 2 ? 2 : 1);

  const { W, D } = houseDims(h, cell);
  const HW = W / 2, HD = D / 2;

  const isGran = kind === 'granary';
  const isShrine = kind === 'shrine';
  const isRich = kind === 'rich';

  const wallKey = (idx % 3 === 0) ? 'wall2' : 'wall';
  const tileKey = (idx % 4 === 0) ? 'tile2' : 'tile';

  /* ── 尺寸 ─────────────────────────────────────────────────── */
  const plinthH = isGran ? 0.62 : PLINTH_H;               // 粮仓架空，墙脚抬高
  const storyH = Math.min(2.75, Math.max(2.30, 2.15 + Math.min(W, D) * 0.08));
  const wallH = floors * storyH;
  const wallTop = plinthH + wallH;
  const roofH = Math.min(1.75, Math.max(1.10, 0.85 + 0.13 * D));
  const over = isGran ? 0.52 : 0.46;                       // 挑檐
  const roofD = D + over * 2;                              // 屋顶进深（含挑檐）
  const roofBase = wallTop + 0.10;                         // 屋面落在墙帽上
  const roofW = W + GABLE_T * 2 - 0.14;                    // 屋面两端埋进山墙
  const wallMatKey = isGran ? 'dirt' : wallKey;            // 粮仓夯土偏黄褐

  /* ── 门窗洞（面宽两间：门居中，左右各一间）────────────────── */
  const dw = isGran ? Math.min(0.85, W * 0.16)
    : isShrine ? Math.min(1.00, W * 0.19)
      : Math.min(1.15, W * 0.22);
  /* 小庙/粮仓的门做矮：门楣上方要留气窗 / 通风格栅 */
  const dh = isGran ? Math.min(1.55, storyH * 0.62)
    : isShrine ? Math.min(1.85, storyH * 0.72)
      : Math.min(2.05, storyH * 0.80);
  const doorU = 0;
  const winH = Math.min(1.05, storyH * 0.42);
  const sill = Math.min(0.95, storyH * 0.38);
  const space = HW - dw / 2 - 0.20;
  const per = space >= 2.20 ? 2 : ((style >= 1 && space >= 1.05) ? 2 : (space >= 0.60 ? 1 : 0));
  const ww = per ? Math.min(1.15, (space - 0.20 * (per - 1)) / per) : 0;

  const frontHoles = [], backHoles = [], frontWins = [], backWins = [];
  frontHoles.push({ u: doorU, v: 0, w: dw, h: dh });

  for (const s of [-1, 1]) {
    for (let j = 0; j < per; j++) {
      const u = s * (dw / 2 + 0.20 + ww / 2 + j * (ww + 0.20));
      if (Math.abs(u) + ww / 2 > HW - 0.06) continue;
      frontWins.push({ u, v: sill, w: ww, h: winH });
      frontHoles.push({ u, v: sill, w: ww, h: winH });
    }
  }
  /* 背立面开窗 */
  const bw2 = Math.min(1.0, W * 0.2);
  if (HW > bw2 + 0.34) {
    for (const s of [-1, 1]) {
      const u = s * (bw2 / 2 + 0.22);
      backWins.push({ u, v: sill, w: bw2, h: winH });
      backHoles.push({ u, v: sill, w: bw2, h: winH });
    }
  }
  /* 二层：前脸一排窗 */
  if (floors === 2) {
    const w2 = Math.min(0.95, W * 0.19);
    for (const s of [-1, 1]) {
      const u = s * (dw / 2 + 0.26 + w2 / 2);
      if (Math.abs(u) + w2 / 2 > HW - 0.06) continue;
      frontWins.push({ u, v: storyH + 0.86, w: w2, h: Math.min(0.92, storyH * 0.34) });
      frontHoles.push({ u, v: storyH + 0.86, w: w2, h: Math.min(0.92, storyH * 0.34) });
    }
  }
  /* 小庙：门楣上开一个小气窗 */
  if (isShrine && dh + 0.14 + 0.34 < wallH - 0.08) {
    const vw = Math.min(0.50, W * 0.14);
    frontWins.push({ u: doorU, v: dh + 0.14, w: vw, h: 0.34 });
    frontHoles.push({ u: doorU, v: dh + 0.14, w: vw, h: 0.34 });
  }

  /* ── 勒脚 / 石墩 ─────────────────────────────────────────── */
  if (isGran) {
    const px = W > 3.6 ? [-HW + 0.34, 0, HW - 0.34] : [-HW + 0.32, HW - 0.32];
    const pz = D > 3.6 ? [-HD + 0.34, 0, HD - 0.34] : [-HD + 0.32, HD - 0.32];
    for (const x of px) for (const z of pz) P('stone', box(0.28, 0.48, 0.28, x, 0.24, z));
    P('woodDark', box(W + 0.10, 0.14, D + 0.10, 0, 0.55, 0));      // 木地板
  } else {
    P('stone', plinthGeo(W, D, plinthH));
  }

  /* ── 四面墙 ───────────────────────────────────────────────── */
  const front = wallWithHoles(W, wallH, WALL_T, frontHoles);
  front.translate(0, plinthH, -HD + WALL_T / 2);
  P(wallMatKey, front);

  const back = wallWithHoles(W, wallH, WALL_T, backHoles);
  back.rotateY(Math.PI);
  back.translate(0, plinthH, HD - WALL_T / 2);
  P(wallMatKey, back);

  const sideLen = Math.max(0.3, D - WALL_T * 2);
  const left = wallWithHoles(sideLen, wallH, WALL_T, []);
  left.rotateY(Math.PI / 2);
  left.translate(-HW + WALL_T / 2, plinthH, 0);
  P(wallMatKey, left);

  const right = wallWithHoles(sideLen, wallH, WALL_T, []);
  right.rotateY(-Math.PI / 2);
  right.translate(HW - WALL_T / 2, plinthH, 0);
  P(wallMatKey, right);

  /* 室内暗腔：门洞看进去是暗的，不会看穿 */
  P('woodDark', box(
    Math.max(0.2, W - WALL_T * 2 - 0.02), Math.max(0.2, wallH - 0.03),
    Math.max(0.2, D - WALL_T * 2 - 0.02), 0, plinthH + wallH / 2, 0));

  /* ── 阑额（木梁带）+ 墙帽（黛瓦）─────────────────────────── */
  P('woodDark', box(W + 0.07, 0.12, D + 0.07, 0, wallTop - 0.11, 0));
  P(isGran ? 'wood' : tileKey, box(W + 0.05, 0.10, D + 0.05, 0, wallTop + 0.05, 0));

  /* 前脸角柱（木构色差） */
  for (const s of [-1, 1]) {
    P('woodDark', box(0.19, wallH, 0.19, s * (HW - 0.13), plinthH + wallH / 2, -HD + 0.095));
  }
  if (floors === 2) {
    P(tileKey, box(W + 0.18, 0.09, D + 0.18, 0, plinthH + storyH + 0.045, 0));
  }

  /* ── 木板门（门簪朝外）+ 门框 ────────────────────────────── */
  const door = doorGeo(dw, dh);
  door.rotateY(Math.PI);
  door.translate(doorU, plinthH, -HD + WALL_T / 2);
  P(isShrine ? 'woodRed' : 'wood', door);
  P('woodDark', box(0.10, dh + 0.14, WALL_T + 0.06, doorU - dw / 2 - 0.05, plinthH + (dh + 0.14) / 2, -HD + WALL_T / 2));
  P('woodDark', box(0.10, dh + 0.14, WALL_T + 0.06, doorU + dw / 2 + 0.05, plinthH + (dh + 0.14) / 2, -HD + WALL_T / 2));
  P('woodDark', box(dw + 0.22, 0.11, WALL_T + 0.06, doorU, plinthH + dh + 0.07, -HD + WALL_T / 2));
  P('stone', box(dw + 0.28, 0.07, WALL_T + 0.12, doorU, plinthH - 0.035, -HD + WALL_T / 2));

  /* ── 木格窗 + 窗纸（自发光暖黄，不加光源）────────────────── */
  for (const win of frontWins) {
    const f = windowFrameGeo(win.w, win.h, 3);
    f.translate(win.u, plinthH + win.v, -HD - 0.02);
    P('wood', f);
    P('paper', box(win.w, win.h, 0.04, win.u, plinthH + win.v + win.h / 2, -HD + 0.06));
  }
  for (const win of backWins) {
    const f = windowFrameGeo(win.w, win.h, 3);
    f.rotateY(Math.PI);
    f.translate(win.u, plinthH + win.v, HD + 0.02);
    P('wood', f);
    P('paper', box(win.w, win.h, 0.04, win.u, plinthH + win.v + win.h / 2, HD - 0.06));
  }

  /* ── 门前石阶（2 级）+ 墙根散石 ─────────────────────────── */
  if (isGran) {
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 3;
      P('stone', box(dw + 0.40 - i * 0.09, plinthH * t, 0.32, doorU, plinthH * t / 2, -HD - 0.16 - i * 0.32));
    }
  } else {
    P('stone', box(dw + 0.50, plinthH, 0.36, doorU, plinthH / 2, -HD - 0.18));
    P('stone', box(dw + 0.78, plinthH * 0.5, 0.36, doorU, plinthH * 0.25, -HD - 0.54));
  }

  const nRock = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < nRock; i++) {
    const s = 0.10 + rng() * 0.15;
    const side = Math.floor(rng() * 4);
    let rx = 0, rz = 0;
    if (side === 0) { rx = (rng() - .5) * W * 0.94; rz = -HD - 0.16 - rng() * 0.24; }
    else if (side === 1) { rx = (rng() - .5) * W * 0.94; rz = HD + 0.16 + rng() * 0.24; }
    else if (side === 2) { rx = -HW - 0.16 - rng() * 0.24; rz = (rng() - .5) * D * 0.94; }
    else { rx = HW + 0.16 + rng() * 0.24; rz = (rng() - .5) * D * 0.94; }
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(1, 0.5 + rng() * 0.35, 1);
    g.rotateY(rng() * 6.28);
    g.rotateZ((rng() - .5) * 0.45);
    g.translate(rx, s * 0.26, rz);
    P('rock', g);
  }

  /* ── 屋顶 ─────────────────────────────────────────────────── */
  const roof = gableRoofGeo(
    Math.max(0.28, roofW - over * 2), D, roofH,
    { overhang: over, curve: isGran ? 0.16 : 0.34, courses: isGran ? 13 : 8, lift: isGran ? 0.03 : 0.05, nu: 16 });
  roof.translate(0, roofBase, 0);
  P(isGran ? 'thatch' : tileKey, roof);
  if (isGran) {
    P('thatch', box(roofW * 0.99, 0.19, 0.36, 0, roofBase + roofH + 0.04, 0));   // 茅草屋脊
    const fringe = Math.max(10, Math.round(roofW * 4));
    for (let i = 0; i < fringe; i++) {
      const x = -roofW / 2 + 0.14 + (roofW - 0.28) * i / (fringe - 1);
      const g = box(0.06, 0.22, 0.10, x, roofBase - 0.08, -roofD / 2 + 0.02);
      g.rotateX(0.12 + (i % 3) * 0.05);
      P('thatch', g);
    }
  }

  /* ── 马头墙（左右山墙，阶梯轮廓 + 黛瓦压顶）──────────────── */
  const gableH = Math.max((roofBase + roofH + 0.15) / 0.7975, (roofBase - 0.05) / 0.55);
  const halfLen = roofD / 2;
  const prof = stepProfile(halfLen, gableH, 3);
  for (const sx of [-1, 1]) {
    const dir = sx > 0 ? 1 : -1;
    const xBack = sx > 0 ? HW : -HW;
    const xFront = sx > 0 ? HW + GABLE_T : -HW - GABLE_T;
    const backPanel = steppedGableGeo(halfLen, gableH, { thick: GABLE_T, steps: 3, dir });
    backPanel.translate(xBack, 0, roofD / 4);
    P(wallMatKey, backPanel);
    const frontPanel = steppedGableGeo(halfLen, gableH, { thick: GABLE_T, steps: 3, dir });
    frontPanel.rotateY(Math.PI);
    frontPanel.translate(xFront, 0, -roofD / 4);
    P(wallMatKey, frontPanel);

    const cop = [];
    copingOf(prof, sx => -sx + roofD / 4, xBack + dir * GABLE_T / 2, GABLE_T, 0.08, cop);
    copingOf(prof, sx => sx - roofD / 4, xFront - dir * GABLE_T / 2, GABLE_T, 0.08, cop);
    for (const c of cop) P(isGran ? 'thatch' : tileKey, c);
  }

  /* ── 二层挑台 + 栏杆 ──────────────────────────────────────── */
  if (floors === 2) {
    const bw = Math.min(W * 0.76, 3.2);
    const ry = plinthH + storyH + 0.10;
    P('wood', box(bw, 0.10, 0.38, 0, ry - 0.05, -HD - 0.19));
    P('wood', box(bw, 0.07, 0.08, 0, ry + 0.82, -HD - 0.34));
    P('wood', box(bw, 0.05, 0.07, 0, ry + 0.14, -HD - 0.34));
    const n = Math.max(6, Math.round(bw / 0.26));
    for (let i = 0; i <= n; i++) {
      const x = -bw / 2 + bw * i / n;
      P('wood', box(0.05, 0.78, 0.05, x, ry + 0.40, -HD - 0.34));
    }
    for (const s of [-1, 1]) {
      P('wood', box(0.08, 0.07, 0.34, s * bw / 2, ry + 0.82, -HD - 0.18));
      P('wood', box(0.05, 0.78, 0.05, s * bw / 2, ry + 0.40, -HD - 0.18));
    }
  }

  /* ── 门头披檐 ─────────────────────────────────────────────── */
  if (style >= 2 || isRich) {
    const pw = dw + 0.65, pd = 0.95;
    const g = box(pw, 0.08, pd);
    g.rotateX(-0.30);
    g.translate(doorU, plinthH + dh + 0.26, -HD - 0.34);
    P(tileKey, g);
    P('wood', box(0.08, 0.10, 0.62, doorU - pw / 2 + 0.15, plinthH + dh + 0.03, -HD - 0.12));
    P('wood', box(0.08, 0.10, 0.62, doorU + pw / 2 - 0.15, plinthH + dh + 0.03, -HD - 0.12));
  }

  /* ── 富户：院门楼 + 院墙 ──────────────────────────────────── */
  if (isRich || style === 3) {
    const gz = -HD - 0.58;
    const gw = dw + 1.05;
    P('woodRed', box(0.17, 2.25, 0.17, doorU - gw / 2, 1.125, gz));
    P('woodRed', box(0.17, 2.25, 0.17, doorU + gw / 2, 1.125, gz));
    P('woodRed', box(gw + 0.40, 0.18, 0.22, doorU, 2.30, gz));
    const gr = gableRoofGeo(gw * 0.52, 0.72, 0.36, { overhang: .20, curve: .20, courses: 4, nu: 10 });
    gr.translate(doorU, 2.39, gz);
    P(tileKey, gr);
    const gd = doorGeo(dw * 0.90, 1.70);
    gd.rotateY(Math.PI);
    gd.translate(doorU, 0, gz);
    P('woodDark', gd);
    for (const s of [-1, 1]) {
      const wx = doorU + s * (gw / 2 + 0.24 + 0.62);
      P(wallKey, box(1.24, 0.95, 0.17, wx, 0.475, gz));
      P(tileKey, box(1.34, 0.09, 0.26, wx, 1.00, gz));
    }
  }

  /* ── 小庙：匾额 + 供桌 + 香炉 + 山门 ─────────────────────── */
  if (isShrine) {
    const pw = dw * 1.7;
    P('woodRed', box(pw, 0.40, 0.06, doorU, plinthH + dh + 0.40, -HD - 0.04));
    P('gold', box(pw - 0.14, 0.27, 0.02, doorU, plinthH + dh + 0.40, -HD - 0.08));

    const tx = doorU + dw / 2 + 0.68;
    const tz = -HD - 0.78;
    P('stone', box(1.10, 0.14, 0.62, tx, 0.07, tz));
    P('wood', box(0.94, 0.08, 0.50, tx, 0.83, tz));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P('wood', box(0.07, 0.72, 0.07, tx + sx * 0.40, 0.46, tz + sz * 0.18));
    }
    P('gold', cyl(0.16, 0.12, 0.16, 12, tx, 0.95, tz));
    P('gold', cyl(0.17, 0.17, 0.03, 12, tx, 1.04, tz));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * 6.283;
      P('gold', cyl(0.024, 0.024, 0.05, 6, tx + Math.cos(a) * 0.10, 1.045, tz + Math.sin(a) * 0.10));
    }
    P('woodRed', cyl(0.034, 0.034, 0.22, 8, tx - 0.30, 0.98, tz));
    P('woodRed', cyl(0.034, 0.034, 0.22, 8, tx + 0.30, 0.98, tz));

    const mz = -HD - 0.66;
    P('stone', box(0.22, 2.05, 0.22, doorU - 0.60, 1.025, mz));
    P('stone', box(0.22, 2.05, 0.22, doorU + 0.60, 1.025, mz));
    P('woodRed', box(1.58, 0.17, 0.22, doorU, 2.10, mz));
    const mr = gableRoofGeo(1.42, 0.72, 0.30, { overhang: .18, curve: .20, courses: 4, nu: 10 });
    mr.translate(doorU, 2.19, mz);
    P(tileKey, mr);
    P('gold', box(0.52, 0.22, 0.03, doorU, 1.84, mz - 0.13));
  }

  /* ── 粮仓：通风格栅 ───────────────────────────────────────── */
  if (isGran) {
    const gv = dh + 0.26;                       // 门楣之上
    const gh = 0.38, gwid = Math.min(0.72, W * 0.26);
    for (const s of [-1, 1]) {
      const z = s * (HD - 0.02);
      P('wood', box(gwid + 0.12, 0.055, 0.11, 0, plinthH + gv, z));
      P('wood', box(gwid + 0.12, 0.055, 0.11, 0, plinthH + gv + gh, z));
      for (let i = 0; i < 4; i++) {
        P('wood', box(gwid, 0.055, 0.08, 0, plinthH + gv + 0.08 + i * 0.08, z - s * 0.03));
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   入口
   ══════════════════════════════════════════════════════════════ */
export function build(layout) {
  initMaterials();
  const group = new THREE.Group();
  group.name = 'model-houses';

  const baseSeed = ((Number(layout && layout.seed) | 0) ^ 0x11) | 0;
  const cell = (layout && layout.cell) || CELL_FALLBACK;
  const houses = (layout && layout.houses) || [];
  const buckets = new Map();

  for (let i = 0; i < houses.length; i++) buildHouse(houses[i], i, buckets, baseSeed, cell);

  for (const [key, list] of buckets) {
    if (!list.length) continue;
    const mat = MAT[key];
    if (!mat) continue;
    const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!g) continue;
    /* 瓦/木面里有一批自建的小件（檐板、脊、垂脊、斗拱）法线朝下，
       那部分完全不受光 → 屋顶看着像一块纯黑。合并后统一修一次。 */
    fixUpNormals(g);
    const m = new THREE.Mesh(g, mat);
    m.name = 'houses-' + key;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  group.userData.houseCount = houses.length;
  group.userData.meshCount = group.children.length;
  return group;
}
