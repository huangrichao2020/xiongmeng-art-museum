/* 江南古村 · 地形模块
   ------------------------------------------------------------------
   一张 256m × 256m（layout.W × layout.cell）的江南地面，中心对齐世界原点。

   做法
     ① 挖洞：把 layout 里 TYPE.WATER / TYPE.BRIDGE 的格子挖成洞。
        用 THREE.Shape（地图外框）+ holes（每条河的连续轮廓）定义"水面足迹"，
        地面网格按洞轮廓裁掉 —— 洞内一个地面顶点都不留。
        河面 y = -0.16（与 water.js 的 WATER_Y 一致），河底 y = -0.60，
        岸边做湿泥挡墙（0 → -0.60），保证水面下不是空洞。
     ② 建筑区严格水平：房子 / 路 / 田 / 塔 / 牌坊 所在的格子地面 y 严格 = 0。
        做法是"平坦掩码"：核心村区 + 路的整条格带 + 房子/田/塔的台基
        → 掩码为 1 时高度函数直接 return 0（不是乘 0，是短路，保证 ±0.000）。
     ③ 村外缓坡土丘：低频值噪声 + 3~5 处圆丘，最大 ~6m，平滑无尖刺。
        树按 y=0 落地，所以高地上树周围会被"挖平"成小平台，避免树被埋。
     ④ 材质分区（顶点色 + 几块独立网格）：
        草(MAT.ground) / 夯土(MAT.dirt：晒谷场、路肩、岸墙、河底) /
        碎石(MAT.stone：碎石地、卵石滩) / 菜畦(MAT.paddy) / 远景山(MAT.ground)。
     ⑤ 远处边缘：地图外圈接一圈"远景平原 + 远山"，看不到地面被切断。

   高度基准：地面 y = 0；河面 -0.16（water.js）；路面 0.03 / 沟底 0.008（roads.js）
              —— 本模块只在 y = 0 处出地面，路与沟由 roads.js 自己叠。
   随机数：makeRng(layout.seed ^ 0x7a3b)，不用 Math.random。
   draw call：10（地面 / 夯土 / 河底 / 碎石 / 菜畦 / 远景 / 卵石 / 石头 / 草丛 / 灌木）
*/
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { MAT, initMaterials } from '../core/materials.js';

/* ── 常量 ───────────────────────────────────────────────────── */
export const CORE = 16;            // 村区起始格（与 core/layout.js 的 CORE 一致）
export const WATER_Y = -0.16;      // 河面高度（与 models/water.js 一致）
const RIVER_BED = -0.60;           // 河底
const SUB = 2;                     // 每格细分数（顶点间距 = cell/2 = 1.6m）
const UVS_G = 48;                  // 草地贴图世界尺度（米）
const UVS_D = 40;                  // 泥土贴图世界尺度
const UVS_S = 40;                  // 碎石贴图世界尺度
const ROAD_W = { main: 3.40, stone: 2.40, dirt: 1.70 };   // 与 roads.js 一致
const FLAT_R = 3.40;               // 路的平坦半宽（盖住整条路格）
const CORE_RAMP = 5;               // 村区 → 野外的过渡（格）
const ROAD_RAMP = 5;               // 路两侧过渡（米）
const PAD_RAMP = 3;                // 台基过渡（米）
const TREE_CARVE_R = 3.6;          // 树周挖平半径（米）

/* ── 小工具 ─────────────────────────────────────────────────── */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / ((b - a) || 1e-9));
  return t * t * (3 - 2 * t);
}
function seedOf(layout) {
  const s = layout.seed;
  if (typeof s === 'number' && isFinite(s)) return s | 0;
  const n = parseInt(String(s), 10);
  return isNaN(n) ? 0 : (n | 0);
}
function rectDist(x, z, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}
function pointInPoly(px, pz, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

/* 4 邻域 BFS：到最近标记格的距离（格） */
function bfsDist(W, H, mask) {
  const d = new Float32Array(W * H).fill(1e9);
  const q = [];
  for (let i = 0; i < W * H; i++) if (mask[i]) { d[i] = 0; q.push(i); }
  let head = 0;
  while (head < q.length) {
    const c = q[head++], cx = c % W, cz = (c / W) | 0;
    const nd = d[c] + 1;
    if (cx > 0 && d[c - 1] > nd) { d[c - 1] = nd; q.push(c - 1); }
    if (cx < W - 1 && d[c + 1] > nd) { d[c + 1] = nd; q.push(c + 1); }
    if (cz > 0 && d[c - W] > nd) { d[c - W] = nd; q.push(c - W); }
    if (cz < H - 1 && d[c + W] > nd) { d[c + W] = nd; q.push(c + W); }
  }
  return d;
}

/* 实例化网格（无顶点色） */
function instanced(geo, mat, items) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const d = new THREE.Object3D();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    d.position.set(it.x, it.y, it.z);
    d.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    d.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

/* ── 地形上下文：高度场 + 平坦掩码 + 距离场 ─────────────────── */
function makeCtx(layout, rng) {
  const W = layout.W, H = layout.H, cell = layout.cell;
  const originX = layout.originX, originZ = layout.originZ;
  const TYPE = layout.TYPE;
  const gi = (x, z) => z * W + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const wx = (gx) => originX + gx * cell;
  const wz = (gz) => originZ + gz * cell;

  /* 洞：水格 + 桥格（桥格在河上，让拱桥跨空，别让地面顶出来） */
  const hole = new Uint8Array(W * H);
  const struct = new Uint8Array(W * H);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const t = layout.type[gi(x, z)];
    if (t & (TYPE.WATER | TYPE.BRIDGE)) hole[gi(x, z)] = 1;
    if (t & (TYPE.HOUSE | TYPE.FIELD | TYPE.TOWER | TYPE.PAIFANG)) struct[gi(x, z)] = 1;
  }
  const dWater = bfsDist(W, H, hole);
  const dStruct = bfsDist(W, H, struct);

  /* 路（轴对齐段；端点可能反向，统一成 lo/hi + 轴线坐标）
     注意：生成器标记的 ROAD 格比路本身多一格 —— 段的两端都是格边界，
     但它把 steps+1 个格都标成了路，而路面只盖住 steps 个格，
     多出来的那一格永远在"序号大"的那一侧，所以平地范围要在 hi 端多留一格。 */
  const segs = (layout.roads || []).filter(r => r && r.x1 !== undefined).map(r => {
    const horiz = Math.abs(r.z2 - r.z1) < Math.abs(r.x2 - r.x1);
    let lo, hi, cross;
    if (horiz) {
      lo = Math.min(r.x1, r.x2); hi = Math.max(r.x1, r.x2); cross = r.z1;
    } else {
      lo = Math.min(r.z1, r.z2); hi = Math.max(r.z1, r.z2); cross = r.x1;
    }
    if (hi - lo < 1e-6) { lo -= cell; hi += cell; } else hi += cell;
    return { horiz, lo, hi, cross, kind: r.kind };
  });

  /* 台基：房子 / 田 / 塔 / 牌坊 */
  const pads = [];
  for (const h of layout.houses || []) {
    const w = (h.w || 2) * cell, d = (h.d || 2) * cell;
    pads.push({ x0: h.x - w / 2 - 0.6, x1: h.x + w / 2 + 0.6, z0: h.z - d / 2 - 0.6, z1: h.z + d / 2 + 0.6 });
  }
  for (const f of layout.fields || []) {
    const w = (f.w || 1) * cell, d = (f.h || 1) * cell;
    pads.push({ x0: f.x - w / 2 - 0.5, x1: f.x + w / 2 + 0.5, z0: f.z - d / 2 - 0.5, z1: f.z + d / 2 + 0.5 });
  }
  if (layout.tower) pads.push({ x: layout.tower.x, z: layout.tower.z, r: 4.6 });
  for (const p of layout.paifangs || []) pads.push({ x: p.x, z: p.z, r: 2.4 });

  /* 土丘（村外，3~5m 高） */
  const mounds = [];
  const nM = rng.int(3, 5);
  for (let i = 0; i < nM; i++) {
    let x = 0, z = 0, guard = 0;
    do {
      x = rng.range(-116, 116); z = rng.range(-116, 116); guard++;
    } while (guard < 80 && Math.max(Math.abs(x), Math.abs(z)) < 94);
    mounds.push({ x, z, h: rng.range(3.2, 5.0), r: rng.range(24, 34) });
  }
  const off = [];
  for (let i = 0; i < 8; i++) off.push(rng.range(0, 400));

  /* 树分桶（树按 y=0 落地，高地上要挖平） */
  const treeBin = new Map();
  for (const t of layout.trees || []) {
    const gx = Math.floor((t.x - originX) / cell), gz = Math.floor((t.z - originZ) / cell);
    const k = gz * W + gx;
    let a = treeBin.get(k);
    if (!a) { a = []; treeBin.set(k, a); }
    a.push(t);
  }

  /* ── 高度场 ─────────────────────────────────────────────── */
  function hills(x, z) {
    let h = 0;
    h += (rng.noise2(x / 118 + off[0], z / 118 + off[1]) - 0.5) * 5.0;
    h += (rng.noise2(x / 47 + off[2], z / 47 + off[3]) - 0.5) * 2.3;
    h += (rng.noise2(x / 19 + off[4], z / 19 + off[5]) - 0.5) * 0.75;
    for (const m of mounds) {
      const dx = (x - m.x) / m.r, dz = (z - m.z) / m.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9) h += m.h * Math.exp(-d2);
    }
    return h;
  }
  /* 村区：中心完全平，外面 CORE_RAMP 格渐起 */
  function coreFlat(x, z) {
    const cx = (x - originX) / cell, cz = (z - originZ) / cell;
    const dOut = Math.max(CORE - cx, cx - (W - CORE), CORE - cz, cz - (H - CORE));
    if (dOut <= 0) return 1;
    return 1 - smoothstep(0, CORE_RAMP, dOut);
  }
  /* 到路中心线距离（米） */
  function dRoad(x, z) {
    let best = 1e9;
    for (const s of segs) {
      const a = s.horiz ? x : z;          // 沿路方向的坐标
      const c = s.horiz ? z : x;          // 垂直路方向的坐标
      let d;
      if (a >= s.lo && a <= s.hi) d = Math.abs(c - s.cross);
      else d = Math.hypot(a < s.lo ? s.lo - a : a - s.hi, c - s.cross);
      if (d < best) best = d;
    }
    return best;
  }
  /* 台基掩码 */
  function padFlat(x, z) {
    let best = 0;
    for (const p of pads) {
      const d = p.r != null ? Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r) : rectDist(x, z, p);
      const f = 1 - smoothstep(0, PAD_RAMP, d);
      if (f > best) best = f;
    }
    return best;
  }
  /* 平坦度：1 = 必须水平 */
  function flatness(x, z) {
    const cf = coreFlat(x, z);
    if (cf >= 1) return 1;
    const rf = 1 - smoothstep(FLAT_R, FLAT_R + ROAD_RAMP, dRoad(x, z));
    if (rf >= 1) return 1;
    const pf = padFlat(x, z);
    if (pf >= 1) return 1;
    return Math.min(cf, rf, pf);
  }
  /* 树周挖平：树根在 y=0，坡上要有个小平台 */
  function treeCarve(x, z, h) {
    const cx = Math.floor((x - originX) / cell), cz = Math.floor((z - originZ) / cell);
    let best = 1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const arr = treeBin.get((cz + dz) * W + (cx + dx));
      if (!arr) continue;
      for (const t of arr) {
        const d = Math.hypot(x - t.x, z - t.z);
        if (d < best) best = d;
      }
    }
    if (best > TREE_CARVE_R) return h;
    /* 挖多深随坡高走：坡越陡越要挖平，免得树被埋太深 */
    const w = (1 - smoothstep(0.7, TREE_CARVE_R, best)) * smoothstep(0.15, 0.8, h);
    return h * (1 - w);
  }
  /* 地面高度：村区 / 路 / 台基 严格 0 */
  function height(x, z) {
    const f = flatness(x, z);
    if (f >= 1) return 0;
    let h = hills(x, z) * (1 - f);
    /* 野外不低于 0：树按 y=0 落地，地不能比树根低（否则树浮空） */
    if (h < 0) h = 0.5 * (h + Math.sqrt(h * h + 0.0064));
    if (h > 0.15) h = treeCarve(x, z, h);
    return h;
  }
  /* 到水 / 到建筑的距离（米，近似） */
  function distAt(field, x, z) {
    const cx = Math.floor((x - originX) / cell), cz = Math.floor((z - originZ) / cell);
    let best = 1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (!inb(nx, nz)) continue;
      const v = field[nz * W + nx];
      if (v < best) best = v;
    }
    return best * cell;
  }

  /* ── 水体轮廓（Shape + holes 的洞边界）────────────────── */
  const contours = [];
  {
    const key = (x, z) => x.toFixed(3) + ',' + z.toFixed(3);
    const edges = new Map();
    const add = (ax, az, bx, bz) => {
      const k = key(ax, az);
      let a = edges.get(k);
      if (!a) { a = []; edges.set(k, a); }
      a.push([bx, bz]);
    };
    for (let gz = 0; gz < H; gz++) for (let gx = 0; gx < W; gx++) {
      if (!hole[gi(gx, gz)]) continue;
      const x0 = wx(gx), x1 = wx(gx + 1), z0 = wz(gz), z1 = wz(gz + 1);
      const nb = (x, z) => (inb(x, z) && hole[gi(x, z)]);
      /* 方向统一：水在左（left(dx,dz)=(-dz,dx)） */
      if (!nb(gx, gz - 1)) add(x0, z0, x1, z0);   // 北边 → +X
      if (!nb(gx, gz + 1)) add(x1, z1, x0, z1);   // 南边 → -X
      if (!nb(gx - 1, gz)) add(x0, z1, x0, z0);   // 西边 → -Z
      if (!nb(gx + 1, gz)) add(x1, z0, x1, z1);   // 东边 → +Z
    }
    const used = new Set();
    for (const [k0, arr0] of edges) {
      for (let i0 = 0; i0 < arr0.length; i0++) {
        if (used.has(k0 + '#' + i0)) continue;
        const loop = [];
        let k = k0, i = i0, guard = 0;
        while (guard++ < 40000) {
          used.add(k + '#' + i);
          const p = k.split(',');
          loop.push([parseFloat(p[0]), parseFloat(p[1])]);
          const arr = edges.get(k);
          const nxt = arr[i];
          const nk = key(nxt[0], nxt[1]);
          const na = edges.get(nk);
          if (!na) { loop.push([nxt[0], nxt[1]]); break; }
          let ni = -1;
          for (let j = 0; j < na.length; j++) if (!used.has(nk + '#' + j)) { ni = j; break; }
          if (ni < 0) { loop.push([nxt[0], nxt[1]]); break; }
          k = nk; i = ni;
        }
        if (loop.length > 2) contours.push(loop);
      }
    }
  }

  /* Shape：外框 + 洞（水面足迹） */
  const shape = new THREE.Shape();
  shape.moveTo(originX, originZ);
  shape.lineTo(originX + W * cell, originZ);
  shape.lineTo(originX + W * cell, originZ + H * cell);
  shape.lineTo(originX, originZ + H * cell);
  shape.closePath();
  for (const loop of contours) {
    const p = new THREE.Path();
    p.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i++) p.lineTo(loop[i][0], loop[i][1]);
    p.closePath();
    shape.holes.push(p);
  }
  const shapePts = shape.extractPoints(8);

  /* 洞判定：以 Shape 的洞轮廓为准（点在水多边形内 → 这格是水） */
  const holePoly = shapePts.holes.length
    ? shapePts.holes.map(h => h.map(p => [p.x, p.y]))
    : contours;
  function cellIsHole(gx, gz) {
    const cx = wx(gx) + cell / 2, cz = wz(gz) + cell / 2;
    for (const poly of holePoly) if (pointInPoly(cx, cz, poly)) return true;
    return false;
  }

  return {
    W, H, cell, originX, originZ, hole, dWater, dStruct, segs, pads, mounds, shape, contours,
    holePoly, cellIsHole, height, coreFlat, dRoad, distAt, bedY: (x, z) => RIVER_BED + 0.06 * (rng.noise2(x / 3.1 + 7.7, z / 3.1 + 2.3) - 0.5),
    noise2: rng.noise2,
  };
}

/* ── 顶点色：草 / 夯土 / 湿泥 的斑块过渡 ───────────────────── */
function groundColor(x, z, ctx) {
  const cell = ctx.cell;
  let r = 0.90, g = 1.0, b = 0.82;
  /* 低频斑块（草地深浅） */
  const blot = ctx.noise2(x / 7.2 + 31.7, z / 7.2 + 11.3);
  const t2 = clamp01((blot - 0.34) * 2.6);
  r = lerp(r, 1.28, t2 * 0.72); g = lerp(g, 1.0, t2 * 0.72); b = lerp(b, 0.66, t2 * 0.72);
  /* 村内夯土：近路、近房。村子里的地是被踩出来的土，不是草坪。 */
  const cf = ctx.coreFlat(x, z);
  const roadNear = 1 - smoothstep(1.3, 6.5, ctx.dRoad(x, z));
  const structNear = 1 - smoothstep(1.6, 9.0, ctx.distAt(ctx.dStruct, x, z));
  let earth = clamp01(0.72 * roadNear + 0.68 * structNear);
  /* 村内（coreFlat==1）整体是土场 + 草皮混杂，噪声决定哪块是草、哪块是土 */
  if (cf >= 1) earth = Math.max(earth, 0.34 + 0.52 * t2);
  r = lerp(r, 1.46, earth); g = lerp(g, 1.04, earth); b = lerp(b, 0.44, earth);
  /* 村外：碎石/裸土的冷灰调 */
  const wild = clamp01(1 - cf) * clamp01((blot - 0.50) * 3.0);
  r = lerp(r, 1.22, wild); g = lerp(g, 1.08, wild); b = lerp(b, 0.84, wild);
  /* 近水：湿泥暗带 */
  const wet = 1 - smoothstep(0.15, 1.9, ctx.distAt(ctx.dWater, x, z));
  r = lerp(r, 0.60, wet * 0.85); g = lerp(g, 0.66, wet * 0.85); b = lerp(b, 0.72, wet * 0.85);
  return [r, g, b];
}

/* ═══════════════════════════════════════════════════════════════
   主入口
   ═══════════════════════════════════════════════════════════════ */
export function build(layout) {
  initMaterials();
  const group = new THREE.Group();
  group.name = 'model-terrain';

  const rng = makeRng((seedOf(layout) ^ 0x7a3b) >>> 0);
  const ctx = makeCtx(layout, rng);
  const { W, H, cell, originX, originZ } = ctx;

  /* 材质：共享材质的克隆（加顶点色），缓存避免每次重建泄漏 */
  const mats = terrainMats();

  const SX = W * SUB, SZ = H * SUB;          // 顶点网尺寸
  const vx = (i) => originX + (i * cell) / SUB;
  const vz = (j) => originZ + (j * cell) / SUB;

  /* ═══ 1. 地面主网格（挖洞） ═══════════════════════════════ */
  const pos = [], uvs = [], cols = [], idx = [];
  const vmap = new Int32Array((SX + 1) * (SZ + 1)).fill(-1);
  const heightArr = new Float32Array((SX + 1) * (SZ + 1));
  let hMin = 0, hMax = 0;
  function vidx(i, j) {
    const key = j * (SX + 1) + i;
    let v = vmap[key];
    if (v >= 0) return v;
    v = pos.length / 3;
    vmap[key] = v;
    const x = vx(i), z = vz(j);
    const y = ctx.height(x, z);
    heightArr[key] = y;
    if (y < hMin) hMin = y;
    if (y > hMax) hMax = y;
    pos.push(x, y, z);
    uvs.push((x - originX) / UVS_G, (z - originZ) / UVS_G);
    const c = groundColor(x, z, ctx);
    cols.push(c[0], c[1], c[2]);
    return v;
  }
  let holeCells = 0;
  for (let gz = 0; gz < H; gz++) {
    for (let gx = 0; gx < W; gx++) {
      if (ctx.cellIsHole(gx, gz)) { holeCells++; continue; }   // 洞：不生成任何地面
      for (let a = 0; a < SUB; a++) for (let b = 0; b < SUB; b++) {
        const i0 = gx * SUB + a, j0 = gz * SUB + b;
        const p0 = vidx(i0, j0), p1 = vidx(i0 + 1, j0), p2 = vidx(i0, j0 + 1), p3 = vidx(i0 + 1, j0 + 1);
        idx.push(p0, p2, p1, p1, p2, p3);                      // 法线朝 +Y
      }
    }
  }
  const groundGeo = new THREE.BufferGeometry();
  groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  groundGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  groundGeo.setIndex(idx);
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, mats.ground);
  ground.name = 'terrain-ground';
  ground.receiveShadow = true;
  ground.castShadow = false;
  group.add(ground);

  /* ═══ 2. 夯土：路肩 / 晒谷场 / 岸墙 / 河底 ═════════════════ */
  const dirtPos = [], dirtUv = [], dirtCol = [], dirtIdx = [];
  let dOff = 0;
  function dirtVert(x, y, z, r, g, b) {
    dirtPos.push(x, y, z);
    dirtUv.push((x - originX) / UVS_D, (z - originZ) / UVS_D);
    dirtCol.push(r, g, b);
    return dOff++;
  }
  function dirtQuad(a, b, c, d) { dirtIdx.push(a, c, b, b, c, d); }

  /* 2a. 路肩（踩出来的土路）：贴着路边的窄土带 */
  const SHOULDER = { main: [2.18, 2.95], stone: [1.28, 2.05], dirt: [0.92, 1.62] };
  const SHOULDER_Y = { main: 0.016, stone: 0.019, dirt: 0.022 };
  for (const s of ctx.segs) {
    const rngW = SHOULDER[s.kind] || SHOULDER.dirt;
    const yy = SHOULDER_Y[s.kind] || 0.012;
    const len = s.hi - s.lo;
    if (len < 0.5) continue;
    const n = Math.max(2, Math.round(len / 1.4));
    for (const side of [-1, 1]) {
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const along = lerp(s.lo, s.hi, t);
        const ax = s.horiz ? along : s.cross;
        const az = s.horiz ? s.cross : along;
        /* 外沿做点抖动：踩出来的土肩不是直的 */
        const wob = 1 + 0.16 * Math.sin(ax * 0.9 + az * 1.3 + side * 2.1) + 0.1 * Math.sin(ax * 2.7);
        const oi = rngW[0], oo = rngW[1] * wob;
        const ix = s.horiz ? ax : ax + side * oi;
        const iz = s.horiz ? az + side * oi : az;
        const ox = s.horiz ? ax : ax + side * oo;
        const oz = s.horiz ? az + side * oo : az;
        const cur = [
          [ix, ctx.height(ix, iz) + yy, iz, 1.18, 1.02, 0.80],
          [ox, ctx.height(ox, oz) + yy, oz, 1.10, 1.02, 0.84],
        ];
        if (prev) {
          const a = dirtVert(prev[0][0], prev[0][1], prev[0][2], prev[0][3], prev[0][4], prev[0][5]);
          const b = dirtVert(prev[1][0], prev[1][1], prev[1][2], prev[1][3], prev[1][4], prev[1][5]);
          const c = dirtVert(cur[0][0], cur[0][1], cur[0][2], cur[0][3], cur[0][4], cur[0][5]);
          const d = dirtVert(cur[1][0], cur[1][1], cur[1][2], cur[1][3], cur[1][4], cur[1][5]);
          /* 正面朝上：横路看 side，竖路看 side（方向不同，绕序相反） */
          if (s.horiz ? side < 0 : side > 0) dirtQuad(a, b, c, d); else dirtQuad(a, c, b, d);
        }
        prev = cur;
      }
    }
  }

  /* 2b. 晒谷场：村口一小块夯土场 */
  {
    const spots = [];
    const houses = layout.houses || [];
    for (let i = 0; i < houses.length && spots.length < 5; i++) {
      const h = houses[(i * 7 + 3) % houses.length];
      const ang = rng.range(0, Math.PI * 2), rad = rng.range(6.5, 9.5);
      const cx = h.x + Math.cos(ang) * rad, cz = h.z + Math.sin(ang) * rad;
      if (ctx.distAt(ctx.dStruct, cx, cz) < 3.2) continue;
      if (ctx.dRoad(cx, cz) < 3.0) continue;
      let clash = false;
      for (const s of spots) if (Math.hypot(s.x - cx, s.z - cz) < 12) clash = true;
      if (clash) continue;
      spots.push({ x: cx, z: cz });
    }
    for (const sp of spots) {
      const hw = rng.range(3.0, 4.2), hd = rng.range(2.4, 3.4), rot = rng.range(0, Math.PI);
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const N = 12;
      const ring = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const ex = Math.cos(a) * hw * (0.86 + 0.18 * ctx.noise2(Math.cos(a) * 2 + sp.x, Math.sin(a) * 2 + sp.z));
        const ez = Math.sin(a) * hd * (0.86 + 0.18 * ctx.noise2(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + sp.z));
        const wx2 = sp.x + ex * cs - ez * sn, wz2 = sp.z + ex * sn + ez * cs;
        ring.push(dirtVert(wx2, ctx.height(wx2, wz2) + 0.012, wz2, 1.26, 1.04, 0.72));
      }
      const cen = dirtVert(sp.x, ctx.height(sp.x, sp.z) + 0.012, sp.z, 1.30, 1.06, 0.70);
      for (let i = 0; i < N; i++) dirtIdx.push(cen, ring[(i + 1) % N], ring[i]);
    }
  }

  /* 2b2. 门前院土：每栋房门前 + 房侧一圈夯土
     村子不能是"草坪上摆了几栋房"——江南是屋挨着屋、门口一片土。
     这一层把草皮切开，村子的地面立刻从"公园"变成"聚落"。 */
  {
    const houses = layout.houses || [];
    const DV = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    for (const h of houses) {
      const dv = DV[h.door] || DV.S;
      /* 门口朝路那一侧铺一块长条土，横向摊开 */
      const fx = h.x + dv[0] * 4.2, fz = h.z + dv[1] * 4.2;
      const px = -dv[1], pz = dv[0];          // 垂直于门方向的"横向"
      const hw = 4.6, hl = 3.2;
      const N = 14, ring = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const ex = Math.cos(a) * hw * (0.82 + 0.24 * ctx.noise2(Math.cos(a) * 2.4 + h.x, Math.sin(a) * 2.4 + h.z));
        const el = Math.sin(a) * hl * (0.82 + 0.24 * ctx.noise2(Math.cos(a) * 3.1 + 7, Math.sin(a) * 3.1 + h.z));
        /* 局部坐标：ex 沿横向，el 沿门方向 */
        const wx2 = fx + px * ex + dv[0] * el, wz2 = fz + pz * ex + dv[1] * el;
        ring.push(dirtVert(wx2, ctx.height(wx2, wz2) + 0.005, wz2, 1.30, 1.05, 0.68));
      }
      const cen = dirtVert(fx, ctx.height(fx, fz) + 0.005, fz, 1.34, 1.06, 0.66);
      /* 局部基是镜像（行列式 -1），绕序要反过来才是朝上 */
      for (let i = 0; i < N; i++) dirtIdx.push(cen, ring[i], ring[(i + 1) % N]);
      /* 房侧再来一小块：房子不是孤零零站在土上，得有墙根的印子 */
      for (const s of [-1, 1]) {
        const sx = h.x + px * s * 4.0, sz = h.z + pz * s * 4.0;
        if (ctx.distAt(ctx.dWater, sx, sz) < 1.2) continue;
        const N2 = 9, r2 = [];
        for (let i = 0; i < N2; i++) {
          const a = (i / N2) * Math.PI * 2;
          const ex = Math.cos(a) * 2.5 * (0.8 + 0.3 * ctx.noise2(a + h.x, h.z));
          const el = Math.sin(a) * 1.9 * (0.8 + 0.3 * ctx.noise2(a * 2 + h.z, h.x));
          const wx2 = sx + px * ex + dv[0] * el, wz2 = sz + pz * ex + dv[1] * el;
          r2.push(dirtVert(wx2, ctx.height(wx2, wz2) + 0.004, wz2, 1.22, 1.02, 0.72));
        }
        const c2 = dirtVert(sx, ctx.height(sx, sz) + 0.004, sz, 1.26, 1.04, 0.70);
        for (let i = 0; i < N2; i++) dirtIdx.push(c2, r2[i], r2[(i + 1) % N2]);
      }
    }
  }

  /* 2c. 岸墙 + 河底：水下不是空洞 */
  for (const loop of ctx.contours) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      /* 细分到 1.6m，跟地面网格的边完全对上 */
      const segsN = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell / SUB)));
      for (let k = 0; k < segsN; k++) {
        const t0 = k / segsN, t1 = (k + 1) / segsN;
        const p0x = lerp(a[0], b[0], t0), p0z = lerp(a[1], b[1], t0);
        const p1x = lerp(a[0], b[0], t1), p1z = lerp(a[1], b[1], t1);
        const t0y = ctx.height(p0x, p0z), t1y = ctx.height(p1x, p1z);
        const b0y = ctx.bedY(p0x, p0z), b1y = ctx.bedY(p1x, p1z);
        const A = dirtVert(p0x, t0y, p0z, 0.96, 0.94, 0.90);
        const B = dirtVert(p0x, b0y, p0z, 0.52, 0.56, 0.56);
        const C = dirtVert(p1x, b1y, p1z, 0.52, 0.56, 0.56);
        const D = dirtVert(p1x, t1y, p1z, 0.96, 0.94, 0.90);
        dirtQuad(A, B, C, D);
      }
    }
  }
  /* 河底 */
  {
    const bp = [], bi = [];
    let bo = 0;
    const bv = (x, z) => {
      const y = ctx.bedY(x, z);
      bp.push(x, y, z);
      return bo++;
    };
    for (let gz = 0; gz < H; gz++) for (let gx = 0; gx < W; gx++) {
      if (!ctx.hole[gz * W + gx]) continue;
      for (let a = 0; a < SUB; a++) for (let b = 0; b < SUB; b++) {
        const x0 = originX + gx * cell + (a * cell) / SUB, z0 = originZ + gz * cell + (b * cell) / SUB;
        const x1 = x0 + cell / SUB, z1 = z0 + cell / SUB;
        const p0 = bv(x0, z0), p1 = bv(x1, z0), p2 = bv(x0, z1), p3 = bv(x1, z1);
        bi.push(p0, p2, p1, p1, p2, p3);
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setIndex(bi);
    bg.computeVertexNormals();
    const bm = new THREE.Mesh(bg, mats.bed);
    bm.name = 'terrain-riverbed';
    bm.receiveShadow = false;
    group.add(bm);
  }

  const dirtGeo = new THREE.BufferGeometry();
  dirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(dirtPos, 3));
  dirtGeo.setAttribute('uv', new THREE.Float32BufferAttribute(dirtUv, 2));
  dirtGeo.setAttribute('color', new THREE.Float32BufferAttribute(dirtCol, 3));
  dirtGeo.setIndex(dirtIdx);
  dirtGeo.computeVertexNormals();
  const dirt = new THREE.Mesh(dirtGeo, mats.dirt);
  dirt.name = 'terrain-dirt';
  dirt.receiveShadow = true;
  group.add(dirt);

  /* ═══ 3. 碎石地（村外） ═══════════════════════════════════ */
  {
    const p = [], uv = [], col = [], ix = [];
    let off = 0;
    const pv = (x, z, tone) => {
      p.push(x, ctx.height(x, z) + 0.03, z);
      uv.push((x - originX) / UVS_S, (z - originZ) / UVS_S);
      col.push(tone, tone * 0.99, tone * 0.94);
      return off++;
    };
    let made = 0, guard = 0;
    while (made < 14 && guard++ < 400) {
      const a = rng.range(0, Math.PI * 2), rad = rng.range(96, 124);
      const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
      if (Math.max(Math.abs(cx), Math.abs(cz)) < 72) continue;
      if (ctx.distAt(ctx.dWater, cx, cz) < 6) continue;
      if (ctx.dRoad(cx, cz) < 6) continue;
      const rr = rng.range(2.6, 6.2);
      const N = 11;
      const ring = [];
      for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        const rr2 = rr * (0.62 + 0.5 * ctx.noise2(Math.cos(t) * 2.2 + cx, Math.sin(t) * 2.2 + cz));
        const x = cx + Math.cos(t) * rr2, z = cz + Math.sin(t) * rr2;
        ring.push(pv(x, z, 0.92 + 0.16 * ctx.noise2(x, z)));
      }
      const cen = pv(cx, cz, 0.96);
      for (let i = 0; i < N; i++) ix.push(cen, ring[(i + 1) % N], ring[i]);
      made++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.stone);
    m.name = 'terrain-gravel';
    m.receiveShadow = true;
    group.add(m);
  }

  /* ═══ 4. 菜畦（村外） ═════════════════════════════════════ */
  {
    const p = [], uv = [], col = [], ix = [];
    let off = 0;
    const pv = (x, y, z, tone) => {
      p.push(x, y, z);
      uv.push((x - originX) / UVS_D, (z - originZ) / UVS_D);
      col.push(tone, tone, tone * 0.94);
      return off++;
    };
    let made = 0, guard = 0;
    while (made < 5 && guard++ < 300) {
      const a = rng.range(0, Math.PI * 2), rad = rng.range(88, 118);
      const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
      if (Math.max(Math.abs(cx), Math.abs(cz)) < 70) continue;
      if (ctx.distAt(ctx.dWater, cx, cz) < 8) continue;
      if (ctx.dRoad(cx, cz) < 7) continue;
      const rot = rng.range(0, Math.PI);
      const dirx = Math.cos(rot), dirz = Math.sin(rot);
      const rows = rng.int(4, 6);
      const rowLen = rng.range(9, 15);
      for (let r = 0; r < rows; r++) {
        const offr = (r - (rows - 1) / 2) * 1.15;
        const ox = cx - dirz * offr, oz = cz + dirx * offr;
        const hw = 0.30, hh = 0.11;
        const n = 8;
        let prev = null;
        for (let k = 0; k <= n; k++) {
          const t = k / n - 0.5;
          const bx = ox + dirx * t * rowLen, bz = oz + dirz * t * rowLen;
          const gy = ctx.height(bx, bz);
          const nx = -dirz, nz = dirx;
          const cur = [
            [bx - nx * hw, gy - 0.02, bz - nz * hw],
            [bx - nx * hw * 0.35, gy + hh, bz - nz * hw * 0.35],
            [bx + nx * hw * 0.35, gy + hh, bz + nz * hw * 0.35],
            [bx + nx * hw, gy - 0.02, bz + nz * hw],
          ];
          if (prev) {
            const ids = cur.map((v) => pv(v[0], v[1], v[2], 0.92 + 0.12 * ctx.noise2(v[0] * 0.3, v[2] * 0.3)));
            const ids0 = prev.map((v) => pv(v[0], v[1], v[2], 0.92 + 0.12 * ctx.noise2(v[0] * 0.3, v[2] * 0.3)));
            for (let s = 0; s < 3; s++) ix.push(ids0[s], ids0[s + 1], ids[s], ids0[s + 1], ids[s + 1], ids[s]);
          }
          prev = cur;
        }
      }
      made++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.paddy);
    m.name = 'terrain-vegbeds';
    m.receiveShadow = true;
    group.add(m);
  }

  /* ═══ 5. 远景：地图外圈接出去（平原 + 远山） ═════════════ */
  {
    const p = [], uv = [], col = [], ix = [];
    const L = 4 * (SX);                    // 边界点数（每边 SX 个）
    const pts = [];
    const push = (x, z, nx, nz, cellX, cellZ) => pts.push({ x, z, nx, nz, cx: cellX, cz: cellZ });
    const step = cell / SUB;
    /* 北（z = originZ，向外 -Z） */
    for (let i = 0; i < SX; i++) push(originX + i * step, originZ, 0, -1, Math.floor(i / SUB), 0);
    /* 东 */
    for (let i = 0; i < SX; i++) push(originX + W * cell, originZ + i * step, 1, 0, W - 1, Math.floor(i / SUB));
    /* 南 */
    for (let i = 0; i < SX; i++) push(originX + W * cell - i * step, originZ + H * cell, 0, 1, W - 1 - Math.floor(i / SUB), H - 1);
    /* 西 */
    for (let i = 0; i < SX; i++) push(originX, originZ + H * cell - i * step, -1, 0, 0, H - 1 - Math.floor(i / SUB));

    const levels = [0, 7, 20, 44, 92, 190, 350, 640];
    const ts = [0, 0.05, 0.18, 0.38, 0.62, 0.85, 1, 1];
    const amps = [0, 0.25, 0.9, 2.2, 4.5, 7.5, 10, 11];
    const n = pts.length;
    const ringIdx = [];
    for (let k = 0; k < levels.length; k++) {
      const row = [];
      for (let i = 0; i < n; i++) {
        const q = pts[i];
        const x = q.x + q.nx * levels[k], z = q.z + q.nz * levels[k];
        /* 内圈 = 地图边（跟地面网格同高）；外圈 = 远景平原 + 起伏 */
        const inner = ctx.height(q.x, q.z);
        const inWater = ctx.hole[q.cz * W + q.cx];
        const hIn = inWater ? WATER_Y : inner;
        const far = 2.4 + 3.4 * ctx.noise2(i * 0.013 + 4.4, 0.7);
        const tt = ts[k];
        let y = lerp(hIn, far, tt);
        y += amps[k] * (ctx.noise2(i * 0.021 + k * 3.3, k * 1.7) - 0.5);
        if (k === 0) y = inWater ? WATER_Y : inner;             // 内圈必须严丝合缝
        p.push(x, y, z);
        row.push(p.length / 3 - 1);
        uv.push(x / UVS_G, z / UVS_G);
        const fade = clamp01(k / 5);
        col.push(lerp(0.94, 0.80, fade), lerp(1.0, 0.92, fade), lerp(0.86, 0.98, fade));
      }
      ringIdx.push(row);
    }
    for (let k = 0; k < levels.length - 1; k++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = ringIdx[k][i], b = ringIdx[k][j], c = ringIdx[k + 1][i], d = ringIdx[k + 1][j];
        ix.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.ground);
    m.name = 'terrain-horizon';
    m.receiveShadow = false;
    group.add(m);
  }

  /* ═══ 6. 卵石滩 / 石头 / 草丛 ════════════════════════════ */
  /* 卵石：贴水边，半淹在水里 */
  const pebbles = [];
  {
    for (const loop of ctx.contours) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const cnt = Math.max(1, Math.round(L / 0.85));
        for (let k = 0; k < cnt; k++) {
          if (!rng.chance(0.72)) continue;
          const t = rng();
          const px = lerp(a[0], b[0], t), pz = lerp(a[1], b[1], t);
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const dl = Math.hypot(dx, dz) || 1;
          /* 法线指向水侧（洞在左） */
          const nx = dz / dl, nz = -dx / dl;
          const off = rng.range(0.05, 0.45);
          const x = px + nx * off, z = pz + nz * off;
          const s = rng.range(0.07, 0.26);
          pebbles.push({
            x, y: WATER_Y + rng.range(-0.02, 0.09), z,
            rx: rng.range(0, 3.14), ry: rng.range(0, 6.28), rz: rng.range(0, 3.14),
            sx: s * rng.range(0.8, 1.4), sy: s * rng.range(0.5, 0.9), sz: s * rng.range(0.8, 1.4),
          });
        }
      }
    }
  }
  const peb = instanced(new THREE.IcosahedronGeometry(1, 0), MAT.stone, pebbles);
  if (peb) { peb.name = 'terrain-pebbles'; group.add(peb); }

  /* 石头：山坡上几块 */
  const rocks = [];
  for (let i = 0; i < 34; i++) {
    const a = rng.range(0, Math.PI * 2), rad = rng.range(80, 126);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (Math.max(Math.abs(x), Math.abs(z)) < 74) continue;
    if (ctx.distAt(ctx.dWater, x, z) < 5) continue;
    const s = rng.range(0.45, 1.9);
    rocks.push({
      x, y: ctx.height(x, z) - s * 0.18, z,
      rx: rng.range(0, 3.14), ry: rng.range(0, 6.28), rz: rng.range(0, 3.14),
      sx: s * rng.range(0.8, 1.3), sy: s * rng.range(0.6, 1.0), sz: s * rng.range(0.8, 1.3),
    });
  }
  const rk = instanced(new THREE.IcosahedronGeometry(1, 0), MAT.rock, rocks);
  if (rk) { rk.name = 'terrain-rocks'; group.add(rk); }

  /* 草丛：村外野地 */
  const tufts = [];
  const tuftGeo = new THREE.PlaneGeometry(0.26, 0.5);
  tuftGeo.translate(0, 0.25, 0);
  {
    for (let i = 0; i < 1400; i++) {
      const x = rng.range(-126, 126), z = rng.range(-126, 126);
      if (Math.max(Math.abs(x), Math.abs(z)) < 58) continue;
      if (ctx.distAt(ctx.dWater, x, z) < 1.2) continue;
      if (ctx.dRoad(x, z) < 2.6) continue;
      if (!rng.chance(0.55)) continue;
      const s = rng.range(0.6, 1.5);
      tufts.push({
        x, y: ctx.height(x, z) - 0.03, z,
        ry: rng.range(0, 6.28),
        sx: s * rng.range(0.8, 1.2), sy: s * rng.range(0.7, 1.4), sz: s,
      });
    }
  }
  const tf = instanced(tuftGeo, MAT.leaf, tufts);
  if (tf) { tf.name = 'terrain-grass'; group.add(tf); }

  /* 灌木：村外边缘 */
  const shrubs = [];
  const shrubGeo = new THREE.IcosahedronGeometry(1, 0);
  {
    for (let i = 0; i < 260; i++) {
      const a = rng.range(0, Math.PI * 2), rad = rng.range(70, 126);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (Math.max(Math.abs(x), Math.abs(z)) < 66) continue;
      if (ctx.distAt(ctx.dWater, x, z) < 2.5) continue;
      if (ctx.dRoad(x, z) < 3.5) continue;
      const s = rng.range(0.5, 1.5);
      shrubs.push({
        x, y: ctx.height(x, z) + s * 0.45, z,
        ry: rng.range(0, 6.28),
        sx: s * rng.range(0.9, 1.5), sy: s * rng.range(0.7, 1.1), sz: s * rng.range(0.9, 1.5),
      });
    }
  }
  const sh = instanced(shrubGeo, MAT.leafDark, shrubs);
  if (sh) { sh.name = 'terrain-shrubs'; group.add(sh); }

  /* ═══ 7. 统计 ═══════════════════════════════════════════ */
  let drawCalls = 0, tris = 0;
  group.traverse(o => {
    if (!o.isMesh) return;
    drawCalls++;
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  group.userData = {
    drawCalls,
    triangles: Math.round(tris),
    holeCells,
    heightMin: hMin,
    heightMax: hMax,
    core: CORE,
    waterY: WATER_Y,
    roadY: 0.03,
    gutterY: 0.008,
    /* 别的模块可以拿来把树/道具放到地面上 */
    heightAt: (x, z) => ctx.height(x, z),
    isHole: (gx, gz) => ctx.cellIsHole(gx, gz),
  };
  return group;
}

/* ── 共享材质的带顶点色克隆（缓存） ───────────────────────── */
let MATS = null;
function terrainMats() {
  if (MATS) return MATS;
  initMaterials();
  const mk = (name) => {
    const m = MAT[name].clone();
    m.vertexColors = true;
    /* 贴在地上的装饰层（夯土/碎石/菜畦）靠 polygonOffset 压住 z-fighting */
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -2;
    return m;
  };
  MATS = {
    ground: mk('ground'),
    dirt: mk('dirt'),
    stone: mk('stone'),
    paddy: mk('paddy'),
    bed: (() => {
      const m = MAT.paddyWet.clone();
      m.color = new THREE.Color(0x4a5348);
      m.roughness = 0.9;
      m.metalness = 0.0;
      return m;
    })(),
  };
  return MATS;
}
