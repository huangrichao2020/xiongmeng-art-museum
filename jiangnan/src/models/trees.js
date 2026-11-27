/* 江南古村 · 树木模型（松 / 竹 / 柳 / 榆 / 银杏 / 枯木）
   ------------------------------------------------------------------
   这一版重做的三件事：
     ① **树冠有体积**：4~7 个错位叠压的叶球簇（Icosahedron detail 0/1，
        球半径 0.55~0.85），簇与簇之间高低错落，簇内球也互相穿插。
        之前是"几片压扁的绿多面体"，远看像纸片 —— 压扁（sy<0.7）是主因，
        现在球体接近正球，轮廓才是蓬松的团块。
     ② **树干有比例**：主干向上 1/3 处分出 2~3 根斜枝，每根枝末端承一簇叶。
        树干底径按树高比例给（直径 ≈ 4.8% 树高 → 6m 树约 0.29m），
        根粗梢细、侧面带明暗，根部加一个不规则根盘土丘接住树干。
     ③ **叶色分受光/背光**：同一棵树里，靠太阳一侧的叶球偏黄绿，
        背光一侧偏深青绿；叶材质接上 core/patch.js 的 patchBacklight
        （逆光透光）—— 注意 MAT.leaf.clone() **不会**继承 onBeforeCompile，
        所以必须显式调 patchWind / patchBacklight，clone 是没用的。

   合批：木质件每树种 1 个 InstancedMesh，叶片件每树种 1 个，
     竹竿 / 竹叶各 1 个，AO 两档 —— 全模块 13 个 draw call。 */
import * as THREE from 'three';
import { mergeGeometries, instancedMerge, nonIndexed } from '../core/geo.js';
import { MAT, initMaterials } from '../core/materials.js';
import { makeRng } from '../core/rng.js';
import { aoPatch, aoBatch } from '../core/ao.js';
import { patchWind, patchBacklight } from '../core/patch.js';

const UP = new THREE.Vector3(0, 1, 0);

/* 树种成品高度系数（规范空间 6m） */
const FT = { pine: .96, bamboo: .74, willow: .68, elm: .85, gingko: .86 };
/* 规范空间里的冠幅（米），用来定 AO 半径 */
const CR = { pine: 2.00, bamboo: .95, willow: 1.75, elm: 1.80, gingko: 1.45, dead: .95 };

/* 叶色（sRGB 十六进制）：lo = 背光/底部 深青绿，hi = 受光/顶部 黄绿 */
const LEAF = {
  pine:   { lo: 0x1b2a20, hi: 0x5a7a40 },
  bamboo: { lo: 0x22331c, hi: 0x6d8a42 },
  willow: { lo: 0x1b2a20, hi: 0x5c7a42 },
  elm:    { lo: 0x1d2f21, hi: 0x5d7a42 },
  gingko: { lo: 0x39441f, hi: 0x8b9148 },
};

/* 局部高度（米）。世界高度 = 本值 × 实例缩放 s。 */
const TREE_H = { pine: 6.6, elm: 6.2, gingko: 5.8, willow: 5.4, dead: 5.0 };
/* 树干底半径 / 树高 ≈ 1.7% → 底径 ≈ 树高的 4.8%（6m 树 ≈ 0.29m） */
const TRUNK_RATIO = .018;

/* 正午太阳在 +Z 方向（core/sky.js 的 sunVec(12)）：用来分受光面 / 背光面 */
const SUN_XZ = new THREE.Vector2(0, 1);

/* ── 几何工具 ───────────────────────────────────────────── */

/* 锥形管：沿折线（Catmull-Rom）扫出，根部粗梢头细。
   pts: [x,y,z][]；radii: 与 pts 等长的半径；radial: 环向段数 */
function taperTube(pts, radii, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', .5);
  const n = pts.length;
  const rings = [];
  let arc = 0;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t).normalize();
    if (i > 0) arc += p.distanceTo(rings[i - 1].p);
    const up = Math.abs(tan.y) > .92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const nx = new THREE.Vector3().crossVectors(up, tan).normalize();
    const nz = new THREE.Vector3().crossVectors(tan, nx).normalize();
    rings.push({ p, nx, nz, r: radii[i], arc });
  }
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const R = rings[i];
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2;
      const cx = Math.cos(a), sy = Math.sin(a);
      const dx = R.nx.x * cx + R.nz.x * sy;
      const dy = R.nx.y * cx + R.nz.y * sy;
      const dz = R.nz.x * cx + R.nz.z * sy;
      pos.push(R.p.x + dx * R.r, R.p.y + dy * R.r, R.p.z + dz * R.r);
      nor.push(dx, dy, dz);
      /* u 沿周长、v 沿长度 → 木纹竖着长在树干上 */
      uv.push(j / radial * (R.r * 6.283 * .45), R.arc * .5);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + 1, c = a + radial + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (ri, up) => {
    const R = rings[ri];
    const ci = pos.length / 3;
    pos.push(R.p.x, R.p.y, R.p.z);
    nor.push(0, up, 0);
    uv.push(.5, .5);
    const base = ri * (radial + 1);
    for (let j = 0; j < radial; j++) {
      if (up > 0) idx.push(ci, base + j, base + j + 1);
      else idx.push(ci, base + j + 1, base + j);
    }
  };
  cap(0, -1); cap(n - 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* 不规则球：多面体 + 逐顶点噪声位移（同一位置顶点位移一致，不会裂） */
function blobGeo(r, detail, seed, amp = .30, sy = 1) {
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
  smoothNormals(g);
  return g;
}

/* 按位置把法线平均掉（不合并顶点，面数不变）
   IcosahedronGeometry 是非索引的，同一个位置有 3 个独立顶点，
   computeVertexNormals() 只能算出「每个三角面的法线」——
   于是叶球一颗颗都是硬棱面，远看像绿色水晶石，这就是"豆包感"的一大来源。
   这里按坐标把法线平均，等于在不增加面数的前提下把球面化开。 */
function smoothNormals(geo) {
  const p = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const map = new Map();
  const key = (x, y, z) => `${x.toFixed(4)}|${y.toFixed(4)}|${z.toFixed(4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    let a = map.get(k);
    if (!a) { a = []; map.set(k, a); }
    a.push(i);
  }
  for (const arr of map.values()) {
    if (arr.length < 2) continue;
    let nx = 0, ny = 0, nz = 0;
    for (const i of arr) { nx += n.getX(i); ny += n.getY(i); nz += n.getZ(i); }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const i of arr) n.setXYZ(i, nx, ny, nz);
  }
  n.needsUpdate = true;
  return geo;
}

/* 小叶片：底端为轴心的窄面片，用来打碎冠缘剪影 */
function leafBlade(len, wid, pitch, yaw) {
  const g = new THREE.PlaneGeometry(wid, len, 1, 1);
  g.translate(0, len / 2, 0);
  g.rotateX(pitch);
  g.rotateY(yaw);
  return g;
}

/* 根盘：不规则土丘，接住树干（比树干宽，埋进地里） */
function rootMound(seed, rB) {
  const rr = makeRng(seed + 11);
  const g = blobGeo(rB * 2.3, 0, seed + 11, .62, .34);
  g.scale(1, 1, rr.range(.82, 1.18));
  g.translate(rr.range(-.05, .05), -rB * .85, rr.range(-.05, .05));
  return g;
}

function weld(parts) {
  return mergeGeometries(parts.map(nonIndexed), false);
}

/* ── 顶点色 ─────────────────────────────────────────────── */

/* 木质件：沿 y 的明暗渐变 + 位置去重的噪点（同一处顶点颜色一致） */
function tintWood(geo, o) {
  const p = geo.attributes.position, n = p.count;
  const arr = new Float32Array(n * 3);
  const c0 = o.c0, c1 = o.c1;
  const y0 = o.y0 ?? 0, y1 = o.y1 ?? 1;
  const jit = o.jit ?? .10;
  const rr = makeRng(o.seed ?? 1);
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) { k = 1 + (rr() - .5) * jit * 2; cache.set(key, k); }
    let t = (y - y0) / Math.max(1e-4, y1 - y0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    arr[i * 3] = (c0.r + (c1.r - c0.r) * t) * k;
    arr[i * 3 + 1] = (c0.g + (c1.g - c0.g) * t) * k;
    arr[i * 3 + 2] = (c0.b + (c1.b - c0.b) * t) * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* 叶片：两套叶色 —— 垂直渐变（底深青绿 → 顶黄绿）× 受光/背光系数。
   背光面压暗并偏青，受光面提亮并偏黄；同一棵树因此有两种叶色。 */
function tintLeaf(geo, spec, y0, y1, seed, jit = .12) {
  const p = geo.attributes.position, n = p.count;
  const arr = new Float32Array(n * 3);
  const lo = new THREE.Color(spec.lo), hi = new THREE.Color(spec.hi);
  const rr = makeRng(seed);
  const cache = new Map();
  /* 背光：压暗 + 偏青；受光：提亮 + 偏黄 */
  const BK = [.70, .80, .98], SK = [1.26, 1.14, .68];
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) { k = 1 + (rr() - .5) * jit * 2; cache.set(key, k); }
    let t = (y - y0) / Math.max(1e-4, y1 - y0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const l = Math.hypot(x, z);
    let s = .5;
    if (l > .06) s = .5 + .5 * ((x / l) * SUN_XZ.x + (z / l) * SUN_XZ.y);
    const br = lo.r + (hi.r - lo.r) * t;
    const bg = lo.g + (hi.g - lo.g) * t;
    const bb = lo.b + (hi.b - lo.b) * t;
    arr[i * 3] = br * (BK[0] + (SK[0] - BK[0]) * s) * k;
    arr[i * 3 + 1] = bg * (BK[1] + (SK[1] - BK[1]) * s) * k;
    arr[i * 3 + 2] = bb * (BK[2] + (SK[2] - BK[2]) * s) * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* ── 树冠 ───────────────────────────────────────────────── */

/* 一个叶簇：count 颗错位叠压的叶球（半径 0.55~0.85）+ 几片碎叶 */
function leafCluster(seed, cx, cy, cz, spread, count, opt = {}) {
  const rr = makeRng(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = rr.range(0, 6.283);
    const b = rr.range(-1, 1);
    const rad = rr.range(0, spread);
    const s = Math.sqrt(Math.max(0, 1 - b * b));
    const R = rr.range(opt.r0 ?? .40, opt.r1 ?? .60);
    /* 每簇一颗球细分一级 → 轮廓更圆润（只挑两簇用，省三角面） */
    const det = (opt.detail && i === 0) ? 1 : 0;
    const bl = blobGeo(R, det, seed + i * 37, .30, rr.range(.88, 1.14));
    bl.translate(cx + Math.cos(a) * s * rad, cy + b * rad * .55, cz + Math.sin(a) * s * rad);
    parts.push(bl);
  }
  /* 冠缘碎叶：把剪影打碎 */
  const nb = opt.blades ?? 6;
  for (let i = 0; i < nb; i++) {
    const a = rr.range(0, 6.283);
    const b = rr.range(-.85, .85);
    const s = Math.sqrt(Math.max(0, 1 - b * b));
    const rad = spread + rr.range(.18, .62);
    const bl = leafBlade(rr.range(.24, .44), rr.range(.09, .16), rr.range(.6, 1.5), a);
    bl.translate(cx + Math.cos(a) * s * rad, cy + b * spread * .5, cz + Math.sin(a) * s * rad);
    parts.push(bl);
  }
  return parts;
}

/* 冠簇布局：每树种 4~7 簇，高低错落 */
function crownLayout(type, seed, H, lx, lz) {
  const rr = makeRng(seed + 77);
  const out = [];
  if (type === 'pine') {
    /* 塔形：五层，越往上越小 */
    const wh = [[.40, .98], [.55, .78], [.70, .58], [.84, .40], [.95, .22]];
    wh.forEach(([fy, reach]) => {
      const a = rr.range(0, 6.283);
      out.push({ x: lx + Math.cos(a) * reach, y: H * fy, z: lz + Math.sin(a) * reach, spread: reach * .55, n: 5, blades: 7 });
    });
  } else if (type === 'elm') {
    /* 伞状阔叶冠：五簇摊开 */
    for (let i = 0; i < 5; i++) {
      const a = i * 1.2566 + rr.range(-.38, .38);
      const reach = rr.range(.72, 1.12);
      out.push({
        x: lx + Math.cos(a) * reach, y: H * rr.range(.66, .92), z: lz + Math.sin(a) * reach,
        spread: rr.range(.42, .62), n: 6, blades: 8,
      });
    }
  } else if (type === 'gingko') {
    /* 窄高扇形 */
    for (let i = 0; i < 4; i++) {
      const a = rr.range(0, 6.283);
      const reach = rr.range(.26, .52);
      out.push({
        x: lx + Math.cos(a) * reach, y: H * (.56 + i * .13), z: lz + Math.sin(a) * reach,
        spread: rr.range(.30, .46), n: 5, blades: 6,
      });
    }
  } else if (type === 'willow') {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.5708 + rr.range(-.3, .3);
      const reach = rr.range(.60, 1.00);
      out.push({
        x: lx + Math.cos(a) * reach, y: H * rr.range(.70, .88), z: lz + Math.sin(a) * reach,
        spread: rr.range(.38, .58), n: 5, blades: 7,
      });
    }
  }
  return out;
}

/* 一棵树的骨架 + 冠 */
function buildTree(type, seed) {
  const rr = makeRng(seed);
  const H = TREE_H[type];
  const rB = H * TRUNK_RATIO;
  const wood = [], leaf = [];
  const lx = rr.range(-.13, .13), lz = rr.range(-.13, .13);

  /* 根盘土丘 */
  wood.push(rootMound(seed, rB));

  /* 主干：到树高 1/3 处分叉 */
  const forkY = H * (type === 'willow' ? .27 : .34);
  const trunk = taperTube([
    [0, -rB * 1.5, 0],
    [lx * .16, rB * 3.4, lz * .16],
    [lx * .55, forkY * .60, lz * .55],
    [lx, forkY, lz],
  ], [rB * 1.50, rB * 1.10, rB * .86, rB * .72], 6);
  wood.push(trunk);

  /* 冠簇 + 每簇一根斜枝（枝末端承簇） */
  const cl = crownLayout(type, seed, H, lx, lz);
  cl.forEach((c, i) => {
    wood.push(taperTube([
      [lx, forkY, lz],
      [(lx + c.x) * .5, forkY + (c.y - forkY) * .48, (lz + c.z) * .5],
      [c.x, c.y - .10, c.z],
    ], [rB * .68, rB * .34, rB * .12], 5));
    leaf.push(...leafCluster(seed + 300 + i * 53, c.x, c.y, c.z, c.spread, c.n,
      { blades: c.blades, detail: i === 1 || i === 3 }));
  });

  /* 柳：垂到地面的柳条 */
  if (type === 'willow') {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.2566 + rr.range(-.3, .3);
      const r0 = rr.range(.45, .95);
      const pts = [
        [Math.cos(a) * r0, H * .78, Math.sin(a) * r0],
        [Math.cos(a) * (r0 + .20), H * .60, Math.sin(a) * (r0 + .20)],
        [Math.cos(a) * (r0 + .26), H * .40, Math.sin(a) * (r0 + .26)],
        [Math.cos(a) * (r0 + .20), H * .18, Math.sin(a) * (r0 + .20)],
      ];
      wood.push(taperTube(pts, [.030, .024, .017, .010], 3));
      for (let k = 0; k < 3; k++) {
        const bl = leafBlade(rr.range(.15, .24), rr.range(.05, .08), rr.range(1.6, 2.3), a + rr.range(-.6, .6));
        bl.translate(
          Math.cos(a) * (r0 + .24) + rr.range(-.07, .07),
          H * (.74 - k * .16),
          Math.sin(a) * (r0 + .24) + rr.range(-.07, .07));
        leaf.push(bl);
      }
    }
  }
  return { wood, leaf, H };
}

/* 枯木：虬枝，无叶 */
function buildDead(seed) {
  const rr = makeRng(seed);
  const H = TREE_H.dead;
  const rB = H * TRUNK_RATIO;
  const wood = [];
  const lx = rr.range(-.3, .3), lz = rr.range(-.2, .2);
  wood.push(rootMound(seed, rB));
  wood.push(taperTube([
    [0, -rB * 1.5, 0],
    [lx * .3, rB * 3.2, lz * .3],
    [lx * .8, H * .38, lz * .8],
    [lx * 1.2, H * .62, lz * 1.1],
  ], [rB * 1.5, rB * 1.05, rB * .74, rB * .5], 6));
  for (let i = 0; i < 4; i++) {
    const a = rr.range(0, 6.283);
    const y = rr.range(H * .22, H * .60);
    const reach = rr.range(.55, 1.15);
    wood.push(taperTube([
      [lx * .7, y * .8, lz * .7],
      [lx * .7 + Math.cos(a) * reach * .55, y + rr.range(.2, .5), lz * .7 + Math.sin(a) * reach * .55],
      [lx * .7 + Math.cos(a) * reach, y + rr.range(.35, .8), lz * .7 + Math.sin(a) * reach],
    ], [rB * .5, rB * .25, rB * .09], 4));
  }
  return { wood, leaf: [], H };
}

/* 竹：一丛细竿 + 长条竹叶 */
function buildBamboo(seed) {
  const rr = makeRng(seed);
  const wood = [], leaf = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = i * 1.2566 + rr.range(-.35, .35);
    const rad = rr.range(.10, .42);
    const h = rr.range(4.2, 5.8);
    const dx = Math.cos(a) * rad, dz = Math.sin(a) * rad;
    wood.push(taperTube([
      [dx, -.05, dz],
      [dx * .35 + rr.range(-.08, .08), h * .40, dz * .35 + rr.range(-.08, .08)],
      [dx * .75, h * .76, dz * .75],
      [dx, h, dz],
    ], [.052, .043, .033, .022], 3));
    /* 每根竿顶一簇竹叶 */
    for (let k = 0; k < 7; k++) {
      const la = rr.range(0, 6.283);
      const bl = leafBlade(rr.range(.32, .58), rr.range(.035, .065), rr.range(.9, 1.7), la);
      bl.translate(dx + Math.cos(la) * rr.range(.03, .34), h - rr.range(.05, 1.25), dz + Math.sin(la) * rr.range(.03, .34));
      leaf.push(bl);
    }
  }
  return { wood, leaf, H: 5.2 };
}

/* ── 材质 ───────────────────────────────────────────────── */
function foliageMat() {
  /* 注意：clone() 不复制 onBeforeCompile，透光/风摆必须显式接 */
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .92, side: THREE.DoubleSide,
    bumpMap: MAT.leaf.map, bumpScale: .30,
  });
  m.vertexColors = true;
  patchWind(m, { strength: .085, freq: 1.0 });
  patchBacklight(m, { color: 0x9ec46a, strength: .85, power: 3.0 });
  return m;
}
function barkMat() {
  const m = MAT.bark.clone();
  m.map = null;
  m.bumpMap = MAT.bark.map;
  m.bumpScale = 0.12;
  m.color.setHex(0xa98a63);
  m.vertexColors = true;
  m.roughness = .95;
  return m;
}

/* ── 入口 ───────────────────────────────────────────────── */
export function build(layout) {
  initMaterials();
  const rnd = makeRng((layout.seed | 0) ^ 0x22);

  const group = new THREE.Group();
  group.name = 'model-trees';

  const trees = layout.trees || [];
  const plan = { pine: [], bamboo: [], willow: [], elm: [], gingko: [], dead: [] };
  const aoPts = [];
  for (const t of trees) {
    const type = (t.type in FT) ? t.type : 'elm';
    const groveBoost = t.grove ? 1.08 + rnd() * .14 : 1.0;
    const wide = t.grove ? 1.04 + rnd() * .10 : .92 + rnd() * .16;
    const s = (t.scale ?? 1) * groveBoost * FT[type];
    /* 枯木：约 7%（竹子不算） */
    const dead = type !== 'bamboo' && rnd() < .07;
    const key = dead ? 'dead' : type;
    plan[key].push({
      pos: new THREE.Vector3(t.x, 0, t.z),
      quat: new THREE.Quaternion().setFromAxisAngle(UP, t.rot ?? 0),
      scl: new THREE.Vector3(s * wide, s, s * wide),
      shade: .90 + rnd() * .18,
    });
    /* 接地阴影：冠越大 → 影越大、越淡 */
    const cr = CR[key] * s * wide;
    const strength = cr > 1.7 ? .30 : (cr > 1.0 ? .38 : .46);
    aoPts.push({ x: t.x, z: t.z, r: Math.max(.55, cr * .92), s: strength });
  }

  const bark = barkMat();
  const leafM = foliageMat();

  const add = (geo, mat, list, name) => {
    if (!list.length) return null;
    const m = instancedMerge(geo, list.length, (d, i) => {
      const p = list[i];
      d.position.copy(p.pos);
      d.quaternion.copy(p.quat);
      d.scale.copy(p.scl);
    }, mat);
    m.name = name;
    const c = new THREE.Color();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      c.setRGB(p.shade, p.shade, p.shade);
      m.setColorAt(i, c);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    group.add(m);
    return m;
  };

  /* 木质件：每树种一套几何 */
  const woodSets = {
    pine: buildTree('pine', 1101), elm: buildTree('elm', 1102),
    gingko: buildTree('gingko', 1103), willow: buildTree('willow', 1104), dead: buildDead(1105),
  };
  for (const key of ['pine', 'elm', 'gingko', 'willow', 'dead']) {
    const parts = woodSets[key].wood;
    /* 根盘单独压暗（它是土丘，不该和树干一样亮） */
    const mound = parts[0];
    tintWood(mound, { c0: new THREE.Color(.22, .18, .14), c1: new THREE.Color(.38, .32, .25), y0: -0.2, y1: 0.10, jit: .14, seed: 1201 });
    /* 枯木：灰褐风化色（原来跟活树同色，被顶光照成"白杆"） */
    const dead = key === 'dead';
    for (const p of parts.slice(1)) {
      tintWood(p, dead
        ? { c0: new THREE.Color(.34, .30, .26), c1: new THREE.Color(.66, .60, .52), y0: 0, y1: 4.8, jit: .16, seed: 1200 + key.charCodeAt(0) }
        : { c0: new THREE.Color(.64, .52, .39), c1: new THREE.Color(1.24, 1.13, .99), y0: 0, y1: 4.8, jit: .13, seed: 1200 + key.charCodeAt(0) });
    }
    add(weld(parts), bark, plan[key], 'trees-wood-' + key);
  }

  /* 叶片件 */
  for (const key of ['pine', 'elm', 'gingko', 'willow']) {
    const parts = woodSets[key].leaf;
    for (const p of parts) {
      tintLeaf(p, LEAF[key], 1.2, woodSets[key].H * .95, 1300 + key.charCodeAt(0), .13);
    }
    add(weld(parts), leafM, plan[key], 'trees-leaf-' + key);
  }

  /* 竹：两个变体（一丛 5 根竿 + 竿顶竹叶），各自实例化到一半的竹丛上 */
  {
    const clumps = plan.bamboo;
    const VARIANTS = 2;
    for (let v = 0; v < VARIANTS; v++) {
      const sub = clumps.filter((_, i) => i % VARIANTS === v);
      if (!sub.length) continue;
      const b = buildBamboo(1700 + v * 91);
      for (const p of b.wood) tintWood(p, {
        c0: new THREE.Color(.34, .36, .19), c1: new THREE.Color(.82, .80, .44),
        y0: 0, y1: 5.2, jit: .10, seed: 1800 + v,
      });
      for (const p of b.leaf) tintLeaf(p, LEAF.bamboo, 3.4, 5.6, 1900 + v, .14);
      const place = (d, i) => {
        const p = sub[i];
        d.position.copy(p.pos); d.quaternion.copy(p.quat); d.scale.copy(p.scl);
      };
      const m1 = instancedMerge(weld(b.wood), sub.length, place, bark);
      m1.name = 'trees-wood-bamboo';
      const m2 = instancedMerge(weld(b.leaf), sub.length, place, leafM);
      m2.name = 'trees-leaf-bamboo';
      const cc = new THREE.Color();
      for (let i = 0; i < sub.length; i++) {
        cc.setRGB(sub[i].shade, sub[i].shade, sub[i].shade);
        m1.setColorAt(i, cc);
        m2.setColorAt(i, cc);
      }
      if (m1.instanceColor) m1.instanceColor.needsUpdate = true;
      if (m2.instanceColor) m2.instanceColor.needsUpdate = true;
      group.add(m1);
      group.add(m2);
    }
  }

  /* 接地阴影：按强度分两档合批（2 个 draw call） */
  {
    const strong = aoPts.filter(p => p.s >= .40);
    const soft = aoPts.filter(p => p.s < .40);
    for (const [pts, name] of [[strong, 'trees-ao'], [soft, 'trees-ao']]) {
      if (!pts.length) continue;
      const geos = aoBatch(pts);
      const m = new THREE.Mesh(mergeGeometries(geos, false), aoPatch(1, .46).material);
      m.renderOrder = 2;
      m.castShadow = false; m.receiveShadow = false;
      m.name = name;
      group.add(m);
    }
  }

  group.userData = {
    counts: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length])),
  };
  return group;
}
