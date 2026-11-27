/* 江南古村 · 农田模块（paddy 水田 / dry 旱地 / tea 茶园 / veg 菜地）
   ------------------------------------------------------------------
   契约：
     · 纯函数：只吃 layout，不读全局，不用 Math.random。
       随机源 = makeRng(layout.seed ^ 0x33)，按固定次序消费。
     · 坐标：田块占 gx/gz/w/h 格，格边长 layout.cell。
       田面高度 y = SURF_Y(0.02)，田面必须平整（不做起伏）。
     · 模块导出 build(layout) → THREE.Group，group.name = 'model-farmland'。

   这一版改了什么（原来"一排排绿色圆球/方块"）：
     ① 菜畦不再是绿色平板 + 圆球苗，而是**隆起的土垄**（圆头土棱，
        有可见的畦沟）+ 畦上**成行的低矮叶丛**（15~30cm 的放射状叶片，
        一丛几片叶，不是一个球）。
     ② 旱地的土垄从方块换成圆头土棱，垄上长零星小叶丛。
     ③ 茶树的"球"换成多团不规则矮墩，不再是标准球。
     ④ 秧苗是 5 片窄叶的簇，不是三块交叉的板子。
     ⑤ 颜色分层：深绿 / 墨绿 / 黄绿 / 少量红椒；土色按干湿深浅分几档，
        每格田面还有轻微色差，不是一整块死板的棕。
     ⑥ 有 18% 的畦、10% 的垄留成**翻过的空茬裸土**（颜色更深的湿土）。
     ⑦ 每行菜畦 / 土垄底下都有软 AO 贴片（core/ao.js），贴着垄沟走。
     ⑧ 土面材质：贴图只留作凹凸，颜色自己给（避免"木地板条纹"）。

   合批：所有土垄/菜畦合成 1 个静态 mesh（每条垄按真实尺寸单独建几何，
     UV 按米算，所以不会出现被拉长的条纹），菜叶丛 / 小苗 / 茶墩 /
     秧苗 / 红椒各 1 个 InstancedMesh，AO 合成 1 个 mesh。

   田块重叠的处理（沿用上一版，逻辑没动）：
     布局层允许两块田占同一格（core/layout.js 的 canField 没排除 TYPE.FIELD）。
     用「格归属表」：按面积从小到大让小块优先占地，每格只属于一块田；
     田面按归属格逐格铺（不越界到邻田/房子），田埂按「格边界」生成：
       · 边界外侧是另一块田 → 共享埂，骑在两田交界线上，只生成一条（宽 0.35m）
       · 边界外侧不是田      → 独埂，压在自己田块内侧（绝不越到别田/房子上）
     同一格归属唯一 → 不会有两层埂叠在一起，也不会互相穿面。 */
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { MAT, initMaterials } from '../core/materials.js';
import { mergeGeometries, meshOf, nonIndexed } from '../core/geo.js';
import { aoPatch, aoBatch } from '../core/ao.js';

/* ── 参数（米） ─────────────────────────────────────── */
const SURF_Y = 0.02;        // 田面高度：比地面高一点，避免 z-fighting
const AO_Y = 0.038;         // 接地阴影贴片高度（必须高于田面，否则被田面盖住）
const BUND_W = 0.35;        // 田埂宽
const BUND_H = 0.16;        // 田埂高出田面
const BUND_BASE = -0.08;    // 埂底埋进地里（不悬空）
const BUND_TOP = SURF_Y + BUND_H;
const WATER_Y = SURF_Y + 0.05;   // 浅水面
const WATER_MARGIN = 0.25;        // 水面离埂内沿留出泥岸
const RIDGE_STEP = 0.62;    // 旱地土垄间距
const RIDGE_W = 0.46;       // 旱地土垄宽
const RIDGE_H = 0.12;       // 旱地土垄高（8~15cm 的土脊）
const SPROUT_STEP = 0.44;   // 垄上菜苗间距
const TEA_ROW_STEP = 1.05;  // 茶行行距
const TEA_PLANT_STEP = 0.52;// 茶行株距
const TEA_PATH_W = 0.42;    // 行间土路宽
const RICE_STEP = 0.42;     // 秧苗株距
const VEG_FURROW = 0.38;    // 畦沟宽
const VEG_BED_H = 0.14;     // 菜畦土脊高
const VEG_PLANT_STEP = 0.30;// 菜苗株距
const VEG_CLEAR = 0.14;     // 菜苗离畦沿的余量
const TEA_CLEAR = 0.34;     // 茶球半径 ~0.30
const RICE_CLEAR = 0.10;

/* ── 小工具 ──────────────────────────────────────────── */
function seedOf(layout) {
  const s = layout.seed;
  if (typeof s === 'number' && isFinite(s)) return s | 0;
  const n = parseInt(String(s), 10);
  return isNaN(n) ? 0 : (n | 0);
}
/** 一块贴地的面（uv 按世界坐标铺，避免每格重复同一张贴图） */
function quadXZ(x0, z0, x1, z1, y, cell) {
  const g = new THREE.PlaneGeometry(Math.max(x1 - x0, 0.0008), Math.max(z1 - z0, 0.0008), 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / cell, p.getZ(i) / cell);
  uv.needsUpdate = true;
  return g;
}
function quadXZColor(x0, z0, x1, z1, y, cell, rgb) {
  const g = quadXZ(x0, z0, x1, z1, y, cell);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = rgb[0]; arr[i * 3 + 1] = rgb[1]; arr[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
/* 任意四角点的贴地面（角点可被抖动 → 田块边缘不是笔直硬边） */
function quadPtsXZ(pts, y, cell, rgb) {
  const pos = [], uv = [], idx = [];
  for (const p of pts) {
    pos.push(p[0], y, p[1]);
    uv.push(p[0] / cell, p[1] / cell);
  }
  idx.push(0, 2, 1, 0, 3, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (rgb) {
    const n = 4;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = rgb[0]; arr[i * 3 + 1] = rgb[1]; arr[i * 3 + 2] = rgb[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}
/* 竖直裙边：从田面往下扎进地里（底边埋进土里 5~6cm，不悬空） */
function skirtQuad(a0, a1, yTop, yBot, cell, rgb) {
  const pos = [a0[0], yTop, a0[1], a1[0], yTop, a1[1], a1[0], yBot, a1[1], a0[0], yBot, a0[1]];
  const nor = [];
  const dx = a1[0] - a0[0], dz = a1[1] - a0[1];
  const L = Math.hypot(dx, dz) || 1;
  const nx = dz / L, nz = -dx / L;
  for (let i = 0; i < 4; i++) nor.push(nx, 0, nz);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([a0[0] / cell, a0[1] / cell, a1[0] / cell, a1[1] / cell, a1[0] / cell, yBot / cell, a0[0] / cell, yBot / cell], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  if (rgb) {
    const arr = new Float32Array(12);
    for (let i = 0; i < 4; i++) { arr[i * 3] = rgb[0]; arr[i * 3 + 1] = rgb[1]; arr[i * 3 + 2] = rgb[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}
function boxXZ(cx, cz, w, d, y0, y1, cell) {
  const g = new THREE.BoxGeometry(Math.max(w, 0.0008), Math.max(y1 - y0, 0.0008), Math.max(d, 0.0008));
  g.translate(cx, (y0 + y1) / 2, cz);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / cell, uv.getY(i) * d / cell);
  uv.needsUpdate = true;
  return g;
}

/* 菜畦土带 / 旱地土垄：沿畦方向的**连续条带**，顶面高低起伏。
   截面沿长度方向被拉伸，顶脊高度随位置变化（不是一根等高的圆柱）。 */
function stripGeo(len, wide, high, seed) {
  const rr = makeRng(seed);
  const n = Math.max(3, Math.round(len / .40));
  const p1 = rr.range(0, 6.283), p2 = rr.range(0, 6.283), p3 = rr.range(0, 6.283);
  const crest = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wob = Math.sin(t * 5.3 + p1) * .22 + Math.sin(t * 11.7 + p2) * .12 + Math.sin(t * 23.1 + p3) * .07;
    const h = high * (.80 + wob);
    const dx = Math.sin(t * 7.1 + p2) * wide * .14;
    crest.push([dx, Math.max(h, high * .35)]);
  }
  const sec = [[-.50, 0], [-.36, .58], [-.14, .94], [.12, 1], [.38, .62], [.50, 0]];
  const m = sec.length;
  const arc = [0];
  for (let i = 1; i < m; i++) {
    const dz = (sec[i][0] - sec[i - 1][0]) * wide, dy = (sec[i][1] - sec[i - 1][1]) * high;
    arc.push(arc[i - 1] + Math.hypot(dz, dy));
  }
  const total = arc[m - 1] + Math.hypot((sec[0][0] - sec[m - 1][0]) * wide, (sec[0][1] - sec[m - 1][1]) * high);
  const pos = [], nor = [], uv = [], idx = [];
  const V = 0.25;
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i / n) * len;
    const [dx, h] = crest[i];
    for (let j = 0; j < m; j++) {
      const z = sec[j][0] * wide + dx;
      const y = sec[j][1] * h;
      pos.push(x, y, z);
      const dz = (sec[Math.min(j + 1, m - 1)][0] - sec[Math.max(j - 1, 0)][0]) * wide;
      const dy = (sec[Math.min(j + 1, m - 1)][1] - sec[Math.max(j - 1, 0)][1]) * h;
      const L = Math.hypot(dz, dy) || 1;
      nor.push(0, dz / L, -dy / L);
      uv.push(arc[j] * V, (x + len / 2) * V);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.crest = crest;
  g.userData.total = total;
  return g;
}

/* 取土带顶脊在 u∈[0,1] 处的高度与横向偏移（植株贴地摆放用） */
function crestAt(g, u) {
  const c = g.userData.crest;
  const n = c.length - 1;
  const f = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(n - 1, Math.floor(f)), t = f - i;
  return {
    h: c[i][1] + (c[i + 1][1] - c[i][1]) * t,
    dx: c[i][0] + (c[i + 1][0] - c[i][0]) * t,
  };
}

/* 圆头土棱：把一段封闭截面沿 X 拉长 —— 备用（田埂等）。
   len/width/high 是真实尺寸（米），UV 也按米算（贴图不会拉成长条纹）。 */
function moundGeo(len, wide, high) {
  const sec = [
    [-.50, 0], [-.46, .34], [-.34, .68], [-.16, .93], [.06, 1], [.26, .90], [.42, .58], [.50, 0],
  ];
  const n = sec.length;
  /* 截面弧长（米），用来铺 UV */
  const arc = [0];
  for (let i = 1; i < n; i++) {
    const dz = (sec[i][0] - sec[i - 1][0]) * wide, dy = (sec[i][1] - sec[i - 1][1]) * high;
    arc.push(arc[i - 1] + Math.hypot(dz, dy));
  }
  const total = arc[n - 1] + Math.hypot((sec[0][0] - sec[n - 1][0]) * wide, (sec[0][1] - sec[n - 1][1]) * high);
  const pos = [], nor = [], uv = [], idx = [];
  const P = (i, e) => {
    const s = sec[i];
    return [e ? len / 2 : -len / 2, s[1] * high, s[0] * wide];
  };
  const V = 0.25;   // 1 米 = 0.25 个 UV 单位（贴图 repeat 4 → 约 1 个贴图周期/米）
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = sec[i], b = sec[j];
    const dz = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dz, dy) || 1;
    const nz = -dy / L, ny = dz / L;
    const p0 = P(i, 0), p1 = P(j, 0), p2 = P(j, 1), p3 = P(i, 1);
    const base = pos.length / 3;
    const push = (p, u, v) => { pos.push(p[0], p[1], p[2]); nor.push(0, ny, nz); uv.push(u, v); };
    const u0 = arc[i] * V, u1 = (i === n - 1 ? total : arc[i + 1]) * V;
    const v0 = 0, v1 = len * V;
    push(p0, u0, v0); push(p1, u1, v0); push(p2, u1, v1);
    push(p0, u0, v0); push(p2, u1, v1); push(p3, u0, v1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /* 两端封口（扇形三角） */
  for (let e = 0; e < 2; e++) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = P(i, e);
      pos.push(p[0], p[1], p[2]);
      nor.push(e ? 1 : -1, 0, 0);
      uv.push(.5, .5);
    }
    for (let i = 1; i < n - 1; i++) {
      if (e) idx.push(base, base + i, base + i + 1);
      else idx.push(base, base + i + 1, base + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* 尖头叶片：底端在原点的菱形，2 个三角 */
function leafDiamond(len, wid) {
  const p = [];
  p.push(0, 0, 0, -wid / 2, len * .42, 0, 0, len, 0);
  p.push(0, 0, 0, 0, len, 0, wid / 2, len * .42, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const uv = [];
  for (let i = 0; i < p.length / 3; i++) uv.push(i % 2, i % 3 === 1 ? .42 : 1);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* 叶丛：几片叶从根部放射（像一棵青菜/一丛草），不是球 */
function clumpGeo(seed, o) {
  const rr = makeRng(seed);
  const parts = [];
  const n = o.blades ?? 5;
  for (let i = 0; i < n; i++) {
    const az = rr.range(0, 6.283);
    const pitch = rr.range(o.pitch0 ?? .35, o.pitch1 ?? .95);
    const len = rr.range(o.len0 ?? .16, o.len1 ?? .28);
    const wid = len * rr.range(.52, .78);
    const b = leafDiamond(len, wid);
    b.rotateX(-pitch);
    b.rotateY(az);
    b.translate(rr.range(-.02, .02), 0, rr.range(-.02, .02));
    parts.push(b);
  }
  if (o.core !== false) {
    const ch = o.coreH ?? .08;
    const c = new THREE.ConeGeometry(o.coreR ?? .024, ch, 5);
    c.translate(0, ch / 2, 0);
    parts.push(c);
  }
  return parts;
}

/* 不规则小叶团（茶墩用）：多面体 + 噪声位移 */
function blobGeo(r, detail, seed, amp = .3, sy = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const rr = makeRng(seed);
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let d = cache.get(key);
    if (d === undefined) { d = 1 + (rr() - .5) * amp * 2; cache.set(key, d); }
    p.setXYZ(i, x * d, y * d * sy, z * d);
  }
  g.computeVertexNormals();
  return g;
}

/* 顶点色：沿 y 的明暗渐变（底暗 → 顶亮） */
function tintGeo(geo, c0, c1, y0, y1, seed, jit = .12) {
  const p = geo.attributes.position, n = p.count;
  const arr = new Float32Array(n * 3);
  const rr = makeRng(seed);
  const cache = new Map();
  const A = new THREE.Color(c0), B = new THREE.Color(c1);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) { k = 1 + (rr() - .5) * jit * 2; cache.set(key, k); }
    let t = (y - y0) / Math.max(1e-4, y1 - y0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    arr[i * 3] = (A.r + (B.r - A.r) * t) * k;
    arr[i * 3 + 1] = (A.g + (B.g - A.g) * t) * k;
    arr[i * 3 + 2] = (A.b + (B.b - A.b) * t) * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** InstancedMesh 装配（支持逐实例颜色） */
function makeInstanced(geo, mat, items) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const d = new THREE.Object3D();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    d.position.set(it.x, it.y, it.z);
    d.rotation.set(it.rx || 0, it.ry || 0, 0);
    d.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    if (it.c) m.setColorAt(i, it.c);
  }
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* 沿畦的密度场：有的地方密、有的地方空（不是均匀一排） */
function densityField(seed) {
  const rr = makeRng(seed);
  const p1 = rr.range(0, 6.283), p2 = rr.range(0, 6.283), p3 = rr.range(0, 6.283);
  const f1 = rr.range(2.2, 4.6), f2 = rr.range(5.0, 9.5), f3 = rr.range(11, 19);
  const bias = rr.range(.78, 1.18);
  return (u) => Math.max(0, Math.min(1, bias * (.60 + .58 * (
    Math.sin(u * f1 + p1) * .5 + Math.sin(u * f2 + p2) * .3 + Math.sin(u * f3 + p3) * .2))));
}

/* 一条长条形接地阴影（贴着垄走）：把单位圆盘拉成软长条 */
function aoStripGeo(x, z, len, wid, s) {
  const geos = aoBatch([{ x, z, r: 1, s }]);
  const g = geos[0];
  g.translate(-x, 0, -z);
  g.scale(Math.max(.05, len / 2), 1, Math.max(.05, wid / 2));
  g.translate(x, 0, z);
  g.translate(0, AO_Y - 0.02, 0);      // 抬到田面之上
  return g;
}

/* ── 主入口 ──────────────────────────────────────────── */
export function build(layout) {
  initMaterials();
  const group = new THREE.Group();
  group.name = 'model-farmland';

  const fields = layout.fields || [];
  const cell = layout.cell || 2.5;
  const W = layout.W | 0, H = layout.H | 0;
  const kindCount = { paddy: 0, dry: 0, tea: 0, veg: 0 };
  group.userData = { fields: kindCount, drawCalls: 0 };
  if (!fields.length || !W || !H) return group;

  const r = makeRng((seedOf(layout) ^ 0x33) >>> 0);

  /* 世界坐标：格线 = origin + g*cell */
  const originX = isFinite(layout.originX) ? layout.originX
    : (fields[0].x - (fields[0].gx + fields[0].w / 2) * cell);
  const originZ = isFinite(layout.originZ) ? layout.originZ
    : (fields[0].z - (fields[0].gz + fields[0].h / 2) * cell);
  const GX = gx => originX + gx * cell;      // 格线世界坐标
  const GZ = gz => originZ + gz * cell;

  /* ── 格归属：小块优先，每格只属于一块田 ── */
  const owner = new Int32Array(W * H).fill(-1);
  const order = fields.map((f, i) => i)
    .sort((a, b) => (fields[a].w * fields[a].h - fields[b].w * fields[b].h) || (a - b));
  for (const fi of order) {
    const f = fields[fi];
    for (let z = f.gz; z < f.gz + f.h; z++)
      for (let x = f.gx; x < f.gx + f.w; x++) {
        if (x < 0 || z < 0 || x >= W || z >= H) continue;
        const k = z * W + x;
        if (owner[k] < 0) owner[k] = fi;
      }
  }
  const own = (gx, gz) => (gx < 0 || gz < 0 || gx >= W || gz >= H) ? -2 : owner[gz * W + gx];

  /* ── 材质：贴图只留作凹凸，颜色自己给（避免被拉成木纹条纹） ── */
  /* 土：贴图保留（它是整个场景的色调基准），颜色只做提亮，
     顶点色只做逐格 / 逐垄的微调 —— 不能把贴图摘掉，
     那样反照率会比场景其它部分高好几倍，土会烧成白色。 */
  const soilMat = (hex, vcol = true, rough = .97) => {
    const m = MAT.dirt.clone();
    m.color.setHex(hex);
    m.vertexColors = vcol;
    m.roughness = rough;
    return m;
  };
  const matBund = soilMat(0xa8906c, false);   // 田埂（无顶点色）
  const matSoil = soilMat(0xa08a68, true);    // 田面（顶点色带逐格深浅）
  const matMound = soilMat(0xb59a76, true);   // 土垄（顶点色带明暗渐变）
  const matMud = MAT.paddy;
  const matGround = MAT.ground;
  const matWater = MAT.paddyWet.clone();
  matWater.transparent = true; matWater.opacity = 0.42; matWater.depthWrite = false;
  matWater.roughness = 0.18; matWater.metalness = 0.24;
  const matSheen = MAT.paddyWet.clone();
  matSheen.transparent = true; matSheen.opacity = 0.40; matSheen.depthWrite = false;
  matSheen.color.setHex(0xbcd8cf); matSheen.roughness = 0.06; matSheen.metalness = 0.5;
  matSheen.emissive = new THREE.Color(0x2f5f55); matSheen.emissiveIntensity = 0.18;
  const matCloth = MAT.paper.clone();
  matCloth.color.setHex(0xb6c2cb); matCloth.emissive = new THREE.Color(0x000000); matCloth.emissiveIntensity = 0;
  /* 植株：颜色交给顶点色 + 逐实例色差 */
  const matPlant = MAT.leaf.clone();
  matPlant.map = null;
  matPlant.bumpMap = MAT.leaf.map;
  matPlant.bumpScale = 0.22;
  matPlant.color.setHex(0xffffff);
  matPlant.vertexColors = true;
  matPlant.side = THREE.DoubleSide;
  matPlant.roughness = 0.9;
  const matVegMat = matPlant.clone();
  const matPepper = MAT.leaf.clone();
  matPepper.map = null;
  matPepper.color.setHex(0xffffff);
  matPepper.vertexColors = true;
  matPepper.roughness = 0.6;

  /* ── 收集桶 ── */
  const gBund = [];       // 田埂
  const gSoil = [];       // 田面土（顶点色，逐格深浅）
  const gMud = [];        // 水田泥面
  const gWater = [];      // 浅水层
  const gSheen = [];      // 水面反光条
  const gGround = [];     // 茶园地表
  const gMound = [];      // 土垄 / 菜畦土脊（每条按真实尺寸建几何）
  const iVeg = [], iSprout = [], iTea = [], iRice = [], iPepper = [];
  const scPole = [], scHat = [], scCloth = [];
  const aoGeos = [];
  const bundSeen = new Set();
  let sharedBunds = 0, ownBunds = 0;
  let moundCount = 0;

  /* 某格四边的埂内缩量 */
  function insets(gx, gz, fi) {
    const side = v => (v === fi) ? 0 : (v >= 0 ? BUND_W / 2 : BUND_W);
    return [side(own(gx - 1, gz)), side(own(gx + 1, gz)), side(own(gx, gz - 1)), side(own(gx, gz + 1))];
  }

  /* 放一条土带/菜畦（连续起伏的窄条，真实尺寸 → UV 正确） */
  function putStrip(cx, cz, len, wide, high, ry, tint, seed) {
    const g = stripGeo(Math.max(len, 0.05), Math.max(wide, 0.05), high, seed);
    g.rotateY(ry);
    g.translate(cx, SURF_Y - 0.03, cz);   // 底面沉进田面，避免共面闪烁
    /* 顶点色只做微调（底暗顶亮 + 逐条色差），实际土色由材质给出 */
    tintGeo(g, new THREE.Color(.74 * tint, .70 * tint, .64 * tint),
      new THREE.Color(1.14 * tint, 1.10 * tint, 1.02 * tint), 0, high + 0.03, seed, .10);
    gMound.push(g);
    moundCount++;
    return g;
  }

  /* ── 逐块田 ── */
  for (let fi = 0; fi < fields.length; fi++) {
    const f = fields[fi];
    const kind = (f.kind === 'paddy' || f.kind === 'dry' || f.kind === 'tea' || f.kind === 'veg') ? f.kind : 'dry';
    kindCount[kind]++;

    const cells = [];
    for (let z = f.gz; z < f.gz + f.h; z++)
      for (let x = f.gx; x < f.gx + f.w; x++)
        if (own(x, z) === fi) cells.push([x, z]);
    if (!cells.length) continue;

    const fx0 = f.x - f.w * cell / 2, fz0 = f.z - f.h * cell / 2;
    const fx1 = fx0 + f.w * cell, fz1 = fz0 + f.h * cell;
    const alongX = (f.w * cell) >= (f.h * cell);

    /* 连续格段 */
    const rowRuns = [], colRuns = [];
    {
      const byZ = new Map();
      for (const [x, z] of cells) { if (!byZ.has(z)) byZ.set(z, []); byZ.get(z).push(x); }
      for (const [z, xs] of [...byZ.entries()].sort((a, b) => a[0] - b[0])) {
        xs.sort((a, b) => a - b);
        let s = xs[0], p = xs[0];
        for (let i = 1; i <= xs.length; i++) {
          if (i < xs.length && xs[i] === p + 1) { p = xs[i]; continue; }
          rowRuns.push({ z, x0: s, x1: p + 1 });
          if (i < xs.length) { s = xs[i]; p = xs[i]; }
        }
      }
      const byX = new Map();
      for (const [x, z] of cells) { if (!byX.has(x)) byX.set(x, []); byX.get(x).push(z); }
      for (const [x, zs] of [...byX.entries()].sort((a, b) => a[0] - b[0])) {
        zs.sort((a, b) => a - b);
        let s = zs[0], p = zs[0];
        for (let i = 1; i <= zs.length; i++) {
          if (i < zs.length && zs[i] === p + 1) { p = zs[i]; continue; }
          colRuns.push({ x, z0: s, z1: p + 1 });
          if (i < zs.length) { s = zs[i]; p = zs[i]; }
        }
      }
    }

    /* ── 田埂：按格边界生成，跨田共享一条 ── */
    for (const [cx, cz] of cells) {
      const x0 = GX(cx), x1 = GX(cx + 1), z0 = GZ(cz), z1 = GZ(cz + 1);
      let nb = own(cx - 1, cz);
      if (nb !== fi) {
        const key = 'V|' + cx + '|' + cz;
        if (!bundSeen.has(key)) {
          bundSeen.add(key);
          if (nb >= 0) { sharedBunds++; gBund.push(boxXZ(x0, (z0 + z1) / 2, BUND_W, cell, BUND_BASE, BUND_TOP, cell)); }
          else { ownBunds++; gBund.push(boxXZ(x0 + BUND_W / 2, (z0 + z1) / 2, BUND_W, cell, BUND_BASE, BUND_TOP, cell)); }
        }
      }
      nb = own(cx + 1, cz);
      if (nb !== fi) {
        const key = 'V|' + (cx + 1) + '|' + cz;
        if (!bundSeen.has(key)) {
          bundSeen.add(key);
          if (nb >= 0) { sharedBunds++; gBund.push(boxXZ(x1, (z0 + z1) / 2, BUND_W, cell, BUND_BASE, BUND_TOP, cell)); }
          else { ownBunds++; gBund.push(boxXZ(x1 - BUND_W / 2, (z0 + z1) / 2, BUND_W, cell, BUND_BASE, BUND_TOP, cell)); }
        }
      }
      nb = own(cx, cz - 1);
      if (nb !== fi) {
        const key = 'H|' + cx + '|' + cz;
        if (!bundSeen.has(key)) {
          bundSeen.add(key);
          if (nb >= 0) { sharedBunds++; gBund.push(boxXZ((x0 + x1) / 2, z0, cell, BUND_W, BUND_BASE, BUND_TOP, cell)); }
          else { ownBunds++; gBund.push(boxXZ((x0 + x1) / 2, z0 + BUND_W / 2, cell, BUND_W, BUND_BASE, BUND_TOP, cell)); }
        }
      }
      nb = own(cx, cz + 1);
      if (nb !== fi) {
        const key = 'H|' + cx + '|' + (cz + 1);
        if (!bundSeen.has(key)) {
          bundSeen.add(key);
          if (nb >= 0) { sharedBunds++; gBund.push(boxXZ((x0 + x1) / 2, z1, cell, BUND_W, BUND_BASE, BUND_TOP, cell)); }
          else { ownBunds++; gBund.push(boxXZ((x0 + x1) / 2, z1 - BUND_W / 2, cell, BUND_W, BUND_BASE, BUND_TOP, cell)); }
        }
      }
    }

    /* ── 边界抖动：外沿角点往里收一点 → 田块轮廓不规则，不是笔直硬矩形 ── */
    const cellSet = new Set(cells.map(c => c[0] + ',' + c[1]));
    const jitMap = new Map();
    const cOf = (cx, cz) => [[cx, cz], [cx + 1, cz], [cx + 1, cz + 1], [cx, cz + 1]];
    const ccx = (fx0 + fx1) / 2, ccz = (fz0 + fz1) / 2;
    for (const [cx, cz] of cells) {
      for (const [gx, gz] of cOf(cx, cz)) {
        const key = gx + ',' + gz;
        if (jitMap.has(key)) continue;
        let outer = false;
        for (let dz = -1; dz <= 1 && !outer; dz++)
          for (let dx = -1; dx <= 1; dx++)
            if (!cellSet.has((gx + dx) + ',' + (gz + dz))) { outer = true; break; }
        if (!outer) { jitMap.set(key, [0, 0]); continue; }
        /* 沿"离开田心"的方向往里收 4~25cm（不越出田块，避免压到田埂/邻田） */
        const wx = GX(gx), wz = GZ(gz);
        const dxw = wx - ccx, dzw = wz - ccz;
        const L = Math.hypot(dxw, dzw) || 1;
        const amt = r.range(.04, .25);
        jitMap.set(key, [-dxw / L * amt, -dzw / L * amt]);
      }
    }
    const cornerOf = (gx, gz) => {
      const j = jitMap.get(gx + ',' + gz) || [0, 0];
      return [GX(gx) + j[0], GZ(gz) + j[1]];
    };

    /* ── 田面：逐格给土色（干地偏黄、水田偏湿、菜地偏深，格与格之间有差） ── */
    const soilBase = kind === 'paddy' ? [0.86, 0.90, 0.86]
      : kind === 'tea' ? [0.98, 1.00, 0.86]
        : kind === 'veg' ? [0.94, 0.93, 0.80]
          : [1.0, 0.97, 0.86];
    for (const [cx, cz] of cells) {
      const x0 = GX(cx), z0 = GZ(cz), x1 = GX(cx + 1), z1 = GZ(cz + 1);
      const [iw, ie, inn, is] = insets(cx, cz, fi);
      const q = [cornerOf(cx, cz), cornerOf(cx + 1, cz), cornerOf(cx + 1, cz + 1), cornerOf(cx, cz + 1)];
      /* 田块外沿挂一圈竖直裙边，底边扎进地里 6cm —— 不再是悬空的贴纸 */
      const nb = [[cx - 1, cz, 0, 1], [cx + 1, cz, 1, 0], [cx, cz - 1, 2, 3], [cx, cz + 1, 3, 2]];
      for (const [nx, nz, ia, ib] of nb) {
        if (cellSet.has(nx + ',' + nz)) continue;
        const a = q[ia], b = q[ib];
        if (kind === 'paddy') gMud.push(skirtQuad(a, b, SURF_Y, -0.06, cell));
        else if (kind === 'tea') gGround.push(skirtQuad(a, b, SURF_Y, -0.06, cell));
        else gSoil.push(skirtQuad(a, b, SURF_Y, -0.06, cell, [soilBase[0] * .86, soilBase[1] * .86, soilBase[2] * .86]));
      }
      if (kind === 'paddy') {
        gMud.push(quadPtsXZ(q, SURF_Y, cell));
        const wx0 = x0 + (iw > 0 ? iw + WATER_MARGIN : 0);
        const wx1 = x1 - (ie > 0 ? ie + WATER_MARGIN : 0);
        const wz0 = z0 + (inn > 0 ? inn + WATER_MARGIN : 0);
        const wz1 = z1 - (is > 0 ? is + WATER_MARGIN : 0);
        if (wx1 > wx0 + 0.05 && wz1 > wz0 + 0.05) gWater.push(quadXZ(wx0, wz0, wx1, wz1, WATER_Y, cell));
      } else if (kind === 'tea') {
        gGround.push(quadPtsXZ(q, SURF_Y, cell));
      } else {
        const k = r.range(0.90, 1.06);
        gSoil.push(quadPtsXZ(q, SURF_Y, cell,
          [soilBase[0] * k, soilBase[1] * k, soilBase[2] * k]));
      }
    }
    /* 田块四角的接地阴影（让田块和地面之间不是硬贴纸） */
    {
      const cc = [cornerOf(f.gx, f.gz), cornerOf(f.gx + f.w, f.gz),
      cornerOf(f.gx + f.w, f.gz + f.h), cornerOf(f.gx, f.gz + f.h)];
      for (const p of cc) {
        const g = aoBatch([{ x: p[0], z: p[1], r: 1, s: .30 }])[0];
        g.translate(0, AO_Y - 0.02, 0);      // 抬到田面之上
        aoGeos.push(g);
      }
    }

    /* 沿长边铺一排东西 */
    const axis = alongX ? 'x' : 'z';
    const runs = alongX ? rowRuns : colRuns;
    const crossOrigin = alongX ? fz0 : fx0;
    const alongOrigin = alongX ? fx0 : fz0;
    const crossLen = alongX ? (fz1 - fz0) : (fx1 - fx0);
    const world = (along, cross) => (axis === 'x' ? { x: along, z: cross } : { x: cross, z: along });
    const runGeom = run => (axis === 'x'
      ? { a0: GX(run.x0), a1: GX(run.x1), b0: GZ(run.z), b1: GZ(run.z + 1) }
      : { a0: GZ(run.z0), a1: GZ(run.z1), b0: GX(run.x), b1: GX(run.x + 1) });

    /* ── 秧苗（水田）── */
    if (kind === 'paddy') {
      for (const [cx, cz] of cells) {
        const [iw, ie, inn, is] = insets(cx, cz, fi);
        const x0 = GX(cx) + iw + WATER_MARGIN, x1 = GX(cx + 1) - ie - WATER_MARGIN;
        const z0 = GZ(cz) + inn + WATER_MARGIN, z1 = GZ(cz + 1) - is - WATER_MARGIN;
        if (x1 <= x0 || z1 <= z0) continue;
        const jx = (fx0 - x0) % RICE_STEP, jz = (fz0 - z0) % RICE_STEP;
        for (let x = x0 + jx; x < x1 - RICE_CLEAR; x += RICE_STEP)
          for (let z = z0 + jz; z < z1 - RICE_CLEAR; z += RICE_STEP) {
            if (r() < 0.16) continue;                       // 缺苗
            const s = r.range(0.82, 1.22);
            iRice.push({
              x: x + r.range(-0.05, 0.05), y: SURF_Y - 0.02, z: z + r.range(-0.05, 0.05),
              ry: r.range(0, Math.PI * 2), sx: s, sy: r.range(0.85, 1.35), sz: s,
              c: new THREE.Color(r.range(.78, 1.05), r.range(.9, 1.08), r.range(.62, .86)),
            });
          }
      }
      /* 水面反光条 */
      const nSheen = r.int(2, 4);
      for (let k = 0; k < nSheen; k++) {
        const cx = r.range(fx0 + 1.2, fx1 - 1.2), cz = r.range(fz0 + 1.2, fz1 - 1.2);
        const base = alongX ? 0 : Math.PI / 2;
        const ang = r.chance(0.68) ? base + r.range(-0.2, 0.2) : r.range(0, Math.PI);
        const len = r.range(1.2, 3.2), wid = r.range(0.10, 0.18);
        const g = new THREE.PlaneGeometry(len, wid, 1, 1);
        g.rotateX(-Math.PI / 2); g.rotateY(ang); g.translate(cx, WATER_Y + 0.008, cz);
        gSheen.push(g);
      }
      /* 稻草人 */
      if (r.chance(0.72) && cells.length) {
        const [cx, cz] = cells[r.int(0, cells.length - 1)];
        const px = GX(cx) + cell * 0.5 + r.range(-0.5, 0.5);
        const pz = GZ(cz) + cell * 0.5 + r.range(-0.5, 0.5);
        const rot = Math.atan2((fz0 + fz1) / 2 - pz, (fx0 + fx1) / 2 - px) + Math.PI / 2;
        const pole = new THREE.CylinderGeometry(0.035, 0.05, 1.55, 8); pole.translate(0, 0.775, 0);
        const arm = new THREE.BoxGeometry(1.10, 0.055, 0.055); arm.translate(0, 1.02, 0);
        const poleG = mergeGeometries([pole, arm], false);
        poleG.rotateY(rot); poleG.translate(px, SURF_Y, pz);
        scPole.push(poleG);
        const cone = new THREE.ConeGeometry(0.32, 0.19, 12); cone.translate(0, 1.64, 0);
        const brim = new THREE.CylinderGeometry(0.35, 0.35, 0.025, 12); brim.translate(0, 1.53, 0);
        const hatG = mergeGeometries([cone, brim], false);
        hatG.rotateY(rot); hatG.translate(px, SURF_Y, pz);
        scHat.push(hatG);
        const cloth = new THREE.PlaneGeometry(0.60, 0.70, 2, 2); cloth.translate(0, 0.76, 0.05);
        const scarf = new THREE.PlaneGeometry(0.50, 0.24, 1, 1);
        scarf.rotateX(-Math.PI / 2); scarf.translate(0, 1.00, 0.02);
        const clothG = mergeGeometries([cloth, scarf], false);
        clothG.rotateY(rot); clothG.translate(px, SURF_Y, pz);
        scCloth.push(clothG);
      }
    }

    /* ── 旱地：一垄一垄的翻耕土垄 + 垄上零星菜苗 ── */
    else if (kind === 'dry') {
      const nRidge = Math.max(1, Math.floor(crossLen / RIDGE_STEP));
      const startCross = crossOrigin + (crossLen - nRidge * RIDGE_STEP) / 2 + RIDGE_STEP / 2;
      for (const run of runs) {
        const { a0, a1, b0, b1 } = runGeom(run);
        const len = a1 - a0;
        for (let k = 0; k < nRidge; k++) {
          const c = startCross + k * RIDGE_STEP;
          const c0 = Math.max(c - RIDGE_W / 2, b0), c1 = Math.min(c + RIDGE_W / 2, b1);
          if (c1 - c0 < 0.08) continue;
          const cc = (c0 + c1) / 2;
          const wp = world((a0 + a1) / 2, cc);
          const bare = r.chance(0.10);
          const ry = axis === 'x' ? 0 : Math.PI / 2;
          /* 连续起伏的土垄（局部 X = 长度，局部 Z = 宽度） */
          const g = putStrip(wp.x, wp.z, len, c1 - c0, RIDGE_H, ry,
            (bare ? .84 : 1) * r.range(.94, 1.06), 3000 + fi * 31 + k);
          /* 接地阴影：贴着垄底 */
          aoGeos.push(aoStripGeo(wp.x, wp.z, axis === 'x' ? len : (c1 - c0) * 1.2,
            axis === 'x' ? (c1 - c0) * 1.2 : len, 0.46));
          /* 垄上零星菜苗（密度有起伏） */
          if (bare) continue;
          const dens = densityField(3200 + fi * 31 + k);
          const M = new THREE.Matrix4().makeRotationY(ry);
          const base = new THREE.Vector3(wp.x, SURF_Y - 0.03, wp.z);
          const localX = t => axis === 'x' ? (t - wp.x) : -(t - wp.z);
          const n = Math.floor(len / SPROUT_STEP);
          for (let s = 0; s < n; s++) {
            const t = a0 + (s + 0.5) * (len / Math.max(n, 1));
            if (r() > dens((t - a0) / Math.max(.001, len)) * 1.15) continue;
            const cst = crestAt(g, (t - a0) / Math.max(.001, len));
            const p = new THREE.Vector3(localX(t) + r.range(-.05, .05), cst.h * .82,
              cst.dx + r.range(-.06, .06)).applyMatrix4(M).add(base);
            iSprout.push({
              x: p.x, y: p.y, z: p.z,
              ry: r.range(0, Math.PI * 2), sx: r.range(.85, 1.25), sy: r.range(.8, 1.3),
              c: new THREE.Color(r.range(.70, 1.05), r.range(.88, 1.08), r.range(.55, .82)),
            });
          }
        }
      }
    }

    /* ── 茶园：整齐的茶行 + 行间土路 ── */
    else if (kind === 'tea') {
      const nRow = Math.max(1, Math.floor(crossLen / TEA_ROW_STEP));
      const startCross = crossOrigin + (crossLen - nRow * TEA_ROW_STEP) / 2 + TEA_ROW_STEP / 2;
      for (const run of runs) {
        const { a0, a1, b0, b1 } = runGeom(run);
        for (let k = 0; k < nRow; k++) {
          const c = startCross + k * TEA_ROW_STEP;
          if (c < b0 + TEA_CLEAR || c > b1 - TEA_CLEAR) continue;
          const first = a0 + ((alongOrigin - a0) % TEA_PLANT_STEP + TEA_PLANT_STEP) % TEA_PLANT_STEP;
          for (let t = first; t < a1 - TEA_CLEAR; t += TEA_PLANT_STEP) {
            const sc = r.range(0.86, 1.16), cc = r.range(0.88, 1.12);
            const wp = world(t, c);
            iTea.push({
              x: wp.x, y: SURF_Y, z: wp.z,
              ry: r.range(0, Math.PI * 2), sx: sc, sy: r.range(0.92, 1.10), sz: sc,
              c: new THREE.Color(cc * .92, cc, cc * .82),
            });
          }
          /* 茶行的接地阴影（贴着行底，一条淡长条） */
          const wp0 = world((a0 + a1) / 2, c);
          aoGeos.push(aoStripGeo(wp0.x, wp0.z, axis === 'x' ? (a1 - a0) : TEA_ROW_STEP * .8,
            axis === 'x' ? TEA_ROW_STEP * .8 : (a1 - a0), 0.34));
        }
        /* 行间土路 */
        for (let k = 0; k <= nRow; k++) {
          const c = startCross - TEA_ROW_STEP / 2 + k * TEA_ROW_STEP;
          const c0 = Math.max(c - TEA_PATH_W / 2, b0), c1 = Math.min(c + TEA_PATH_W / 2, b1);
          if (c1 - c0 < 0.06) continue;
          const q = axis === 'x'
            ? quadXZColor(a0, c0, a1, c1, SURF_Y + 0.008, cell, [1.02, 0.98, 0.82])
            : quadXZColor(c0, a0, c1, a1, SURF_Y + 0.008, cell, [1.02, 0.98, 0.82]);
          gSoil.push(q);
        }
      }
    }

    /* ── 菜地：成行的低矮叶丛 + 可见畦沟 + 翻过的空茬 ── */
    else {
      let nBed = 3, bedLen = 0;
      for (let n = 4; n >= 2; n--) {
        const bl = (crossLen - VEG_FURROW * (n + 1)) / n;
        if (bl >= 1.0) { nBed = n; bedLen = bl; break; }
      }
      const bands = [];
      for (let k = 0; k < nBed; k++) {
        const c0 = crossOrigin + VEG_FURROW + k * (bedLen + VEG_FURROW);
        bands.push({ c0, c1: c0 + bedLen, k });
      }
      /* 每块地的菜色：深绿 / 墨绿 / 黄绿 混着来 */
      const vegTints = [
        [0.74, 0.96, 0.68], [0.56, 0.80, 0.58], [1.05, 1.02, 0.70],
        [0.82, 1.02, 0.86], [0.50, 0.72, 0.54], [0.94, 1.00, 0.60],
      ];
      for (const run of runs) {
        const { a0, a1, b0, b1 } = runGeom(run);
        const len = a1 - a0;
        for (const bed of bands) {
          const c0 = Math.max(bed.c0, b0), c1 = Math.min(bed.c1, b1);
          if (c1 - c0 < 0.3) continue;
          const cc = (c0 + c1) / 2;
          const wp = world((a0 + a1) / 2, cc);
          const bare = r.chance(0.12);             // 空茬：这一畦翻过没种
          const ry = axis === 'x' ? 0 : Math.PI / 2;
          const stripW = Math.min(.58, (c1 - c0) * .56);
          /* 菜畦土带：沿畦方向的连续窄条，顶面高低起伏（不是一排等高锥体） */
          const g = putStrip(wp.x, wp.z, len, stripW, VEG_BED_H, ry,
            (bare ? .82 : 1) * r.range(.94, 1.06), 4000 + fi * 37 + bed.k);
          /* 接地阴影：贴着土带底 */
          aoGeos.push(aoStripGeo(wp.x, wp.z, axis === 'x' ? len : stripW * 1.7,
            axis === 'x' ? stripW * 1.7 : len, 0.46));
          if (bare) continue;
          /* 撒菜：密度场有起伏（有的地方密、有的地方空），个别畦只长一半 */
          const rr2 = makeRng(4300 + fi * 71 + bed.k * 7);
          const dens = densityField(4400 + fi * 37 + bed.k);
          const growEnd = rr2.chance(.24) ? rr2.range(.32, .92) : 1;
          const M = new THREE.Matrix4().makeRotationY(ry);
          const base = new THREE.Vector3(wp.x, SURF_Y - 0.03, wp.z);
          const localX = t => axis === 'x' ? (t - wp.x) : -(t - wp.z);
          const step = .135;
          for (let t = a0 + .08; t < a1 - .08; t += step) {
            const u = (t - a0) / Math.max(.001, len);
            if (u > growEnd) continue;
            if (r() > dens(u)) continue;
            const cst = crestAt(g, u);
            const p = new THREE.Vector3(localX(t) + rr2.range(-.05, .05), cst.h * .82,
              cst.dx + rr2.range(-.13, .13) * stripW).applyMatrix4(M).add(base);
            const sc = r.range(.86, 1.22), sy = r.range(.85, 1.18);
            const tint = vegTints[r.int(0, vegTints.length - 1)];
            const it = {
              x: p.x, y: p.y, z: p.z,
              ry: r.range(0, Math.PI * 2), sx: sc, sy, sz: sc,
              c: new THREE.Color(tint[0] * sc, tint[1] * sc, tint[2] * sc),
            };
            if (r.chance(.66)) iVeg.push(it);                       // 成熟菜簇
            else iSprout.push({ ...it, sx: sc * .74, sy: sy * .74, sz: sc * .74 });  // 幼苗
            /* 少量红椒 */
            if (r.chance(0.05)) {
              iPepper.push({
                x: p.x + r.range(-.05, .05), y: p.y + .12, z: p.z + r.range(-.05, .05),
                ry: r.range(0, 6.28), sx: sc, sy, sz: sc,
              });
            }
          }
        }
      }
    }
  }

  /* ── 组装 ── */
  let drawCalls = 0;
  const push = m => { if (m) { group.add(m); drawCalls++; } };

  if (gBund.length) push(meshOf(gBund, matBund));
  if (gSoil.length) push(meshOf(gSoil, matSoil));
  if (gMud.length) push(meshOf(gMud, matMud));
  if (gGround.length) push(meshOf(gGround, matGround));
  if (gWater.length) { const m = meshOf(gWater, matWater); m.renderOrder = 2; m.castShadow = false; push(m); }
  if (gSheen.length) { const m = meshOf(gSheen, matSheen); m.renderOrder = 3; m.castShadow = false; push(m); }
  /* 所有土垄 / 菜畦合成 1 个静态 mesh */
  if (gMound.length) push(meshOf(gMound, matMound));

  /* 植株 */
  {
    /* 成熟菜簇：4 片放射叶（没有中心锥体 —— 那正是"塑料小锥"的来源） */
    const veg = mergeGeometries(clumpGeo(2001, { blades: 4, pitch0: .38, pitch1: 1.10, len0: .18, len1: .34, core: false }).map(nonIndexed), false);
    tintGeo(veg, 0x3c6a33, 0x86ad52, 0, 0.30, 2101, .16);
    push(makeInstanced(veg, matVegMat, iVeg));

    /* 幼苗 / 旱地小苗：3 片窄叶 */
    const sp = mergeGeometries(clumpGeo(2201, { blades: 3, pitch0: .18, pitch1: .78, len0: .14, len1: .25, core: false }).map(nonIndexed), false);
    tintGeo(sp, 0x3a6130, 0x8aa54c, 0, 0.26, 2202, .15);
    push(makeInstanced(sp, matPlant, iSprout));

    /* 秧苗：5 片窄叶 */
    const ri = mergeGeometries(clumpGeo(2301, { blades: 4, pitch0: .10, pitch1: .48, len0: .20, len1: .32, coreR: .014, coreH: .05 }).map(nonIndexed), false);
    tintGeo(ri, 0x4e7033, 0xa2bd5e, 0, 0.34, 2302, .14);
    push(makeInstanced(ri, matPlant, iRice));

    /* 茶墩：3 个压扁叶团 */
    const teaParts = [];
    {
      const rr = makeRng(2401);
      for (let i = 0; i < 2; i++) {
        const b = blobGeo(i === 0 ? .26 : .21, 0, 2400 + i, .34, .72);
        b.translate(i === 0 ? 0 : rr.range(-.14, .14), i === 0 ? .17 : rr.range(.08, .18), i === 0 ? 0 : rr.range(-.14, .14));
        teaParts.push(b);
      }
      for (let i = 0; i < 3; i++) {
        const bl = leafDiamond(rr.range(.10, .16), .05);
        bl.rotateX(rr.range(.3, .9));
        bl.rotateY(rr.range(0, 6.28));
        bl.translate(rr.range(-.1, .1), rr.range(.24, .32), rr.range(-.1, .1));
        teaParts.push(bl);
      }
    }
    const tea = mergeGeometries(teaParts.map(nonIndexed), false);
    tintGeo(tea, 0x1f3f28, 0x55763a, 0, 0.36, 2403, .13);
    push(makeInstanced(tea, matVegMat, iTea));

    /* 红椒：小果子 */
    const pepParts = [];
    {
      const rr = makeRng(2501);
      for (let i = 0; i < 3; i++) {
        const s = new THREE.IcosahedronGeometry(.038, 0);
        s.scale(1, 1.35, 1);
        s.translate(rr.range(-.05, .05), rr.range(-.02, .05), rr.range(-.05, .05));
        pepParts.push(s);
      }
    }
    const pep = mergeGeometries(pepParts.map(nonIndexed), false);
    tintGeo(pep, 0x8e2416, 0xd24a24, -0.05, 0.06, 2502, .10);
    push(makeInstanced(pep, matPepper, iPepper));
  }

  /* 接地阴影：所有行合成 1 个 mesh */
  if (aoGeos.length) {
    const g = mergeGeometries(aoGeos, false);
    const mat = aoPatch(1, 0.46).material;
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 2;
    m.castShadow = false; m.receiveShadow = false;
    m.name = 'farmland-ao';
    group.add(m); drawCalls++;
  }

  /* 稻草人 */
  if (scPole.length) push(meshOf(scPole, MAT.wood));
  if (scHat.length) push(meshOf(scHat, MAT.thatch));
  if (scCloth.length) push(meshOf(scCloth, matCloth));

  group.userData = {
    fields: kindCount,
    bunds: { shared: sharedBunds, own: ownBunds },
    instances: {
      mound: moundCount, sprout: iSprout.length, rice: iRice.length,
      tea: iTea.length, veg: iVeg.length, pepper: iPepper.length, ao: aoGeos.length,
    },
    drawCalls,
  };
  return group;
}
