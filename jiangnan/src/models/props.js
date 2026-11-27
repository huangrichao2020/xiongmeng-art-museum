/* 江南古村 · 道具模块（井 / 晒谷架 / 水车 / 乌篷船 / 酱缸 / 灯笼 / 笼舍）
   ------------------------------------------------------------------
   输入：layout.props[] = {kind, x, z, rot, gx, gz}
     kind ∈ well 井 / dryingrack 晒谷架 / waterwheel 筒车 / boat 乌篷船
            jar 酱缸 / lamp|lantern 灯笼 / pen 笼舍 / fence 篱笆

   做法：每件道具在自己的局部坐标（原点 = 落地中心）搭零件 → 绕 Y 转 rot →
         平移到世界 (x, baseY, z) → 归入材质桶 → 每桶合一个 mesh。

   合批：9 个材质桶 = 9 个静态 mesh；筒车要转，另占 3 个 mesh
         → 合计 12 个 draw call（不管 20 口井还是 8 条船，数字不变）。

   材质：全部取自 core/materials.js 的 MAT，clone 后开 vertexColors 做深浅变化
         （木料深浅、陶缸釉色、竹子青黄、灯笼纸暖白）。

   随机：只用 makeRng(layout.seed ^ 0x3C0B)，按 props 固定次序消费，
         同一个 seed 必得同一张图。

   落地：落地道具最小 y = 0（斜靠的器物单独用 groundify 贴地）；
         船浮在水面 WATER_Y = -0.16，筒车立在河边浅水里（轮下缘吃水）。

   质量线：纯色大方块 = 不合格。所以
     · 井   = 石块砌的井圈（高低错落）+ 井壁 + 井水 + 木辘轳架 + 辘轳筒 + 麻绳 + 吊桶
     · 晒架 = 竹竿 A 架 + 横梁 + 横枨 + 玉米串 / 辣椒串 / 谷穗（挂线 + 挂物）+ 圆晒匾
     · 水车 = 12 根竹筒 + 前后两圈轮辋 + 16 根轮辐 + 轮毂 + 木支架 + 提水槽 + 石础
     · 船   = 放样船壳（两头翘的船底 + 船帮 + 内壳 + 肋骨 + 舱板）+ 半圆乌篷 + 竹篙
     · 酱缸 = 旋成的鼓腹陶缸 + 厚缸沿 + 深色酱面 + 木盖 + 缸脚石圈
     · 灯笼 = 纸罩 + 8 根竹骨 + 上下盖 + 铜挂环 + 流苏 + 竹灯杆 + 石座
     · 笼舍 = 竹桩围栏 + 竹笼（竖条 + 横箍 + 顶篷）+ 竹筐堆 + 蛇篓
*/
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { MAT, initMaterials } from '../core/materials.js';
import { mergeGeometries, nonIndexed } from '../core/geo.js';
import { aoPatch, aoBatch } from '../core/ao.js';

/* ── 常量 ────────────────────────────────────────────────── */
const SEED_XOR = 0x3C0B;      // 本模块自己的随机种子异或常数
const WATER_Y = -0.16;         // 河面高度（与 models/water.js 一致）
const AXLE_Y = 0.90;           // 筒车轴心高（轮辋浮在水面，竹筒吃水）
const BOAT_L = 3.55;           // 乌篷船长
const BOAT_B = 1.10;           // 乌篷船宽

/* 材质桶：key → MAT 里的底材
   注意：木纹 / 石纹贴图本身就是"带颜色的图"，material.color 不能再压深，
   否则颜色相乘，木头就成了一团黑漆。 */
const BUCKETS = [
  { key: 'stone', base: 'stone' },     // 井圈石块、井台、灯杆石座
  { key: 'dark', base: 'stoneDark' },  // 井壁、井水、缸里的酱面
  { key: 'wood', base: 'wood' },       // 木架、木梁、船壳船帮
  { key: 'glaze', base: 'thatch' },    // 乌篷（压到近黑，用平色不用木纹）
  { key: 'jar', base: 'thatch' },      // 酱缸陶身（深褐釉）
  { key: 'bamboo', base: 'thatch' },   // 竹竿、竹骨、竹笼（竹子是平色，不是木纹）
  { key: 'fiber', base: 'thatch' },    // 玉米、谷穗、麻绳
  { key: 'red', base: 'woodRed' },     // 辣椒串、流苏
  { key: 'paper', base: 'lantern' },   // 灯笼纸
  { key: 'metal', base: 'brass' },     // 挂环、箍
];

/* ── 几何小工具 ───────────────────────────────────────────── */
function boxG(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
/* 两点之间的方料（自带"上"方向，旋转后截面不乱翻） */
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
function cylG(r, len, at, dir, seg = 10, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, len, seg);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  g.applyQuaternion(q);
  g.translate(at[0], at[1], at[2]);
  return g;
}
/* 圆环：axis = 环面法线方向（y = 平躺的箍，x/z = 立着的箍） */
function ringG(r, tube, at, axis, seg = 14, rad = 6) {
  const g = new THREE.TorusGeometry(r, tube, rad, seg);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  else if (axis === 'y') g.rotateX(-Math.PI / 2);
  g.translate(at[0], at[1], at[2]);
  return g;
}
/* 圆环：法线沿任意方向 dir（筒口的箍这类） */
function ringDirG(r, tube, at, dir, seg = 12, rad = 5) {
  const g = new THREE.TorusGeometry(r, tube, rad, seg);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  g.applyQuaternion(q);
  g.translate(at[0], at[1], at[2]);
  return g;
}
/* 旋成体（坛子 / 井台 / 篓）：pts = [[r, y], ...] */
function latheG(pts, seg = 18) {
  const v = pts.map(p => new THREE.Vector2(Math.max(p[0], 0.0001), p[1]));
  return new THREE.LatheGeometry(v, seg);
}
/* 放样：一串等长截面 → 曲面（船壳用） */
function loft(sections) {
  const NS = sections.length, NP = sections[0].length;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < NP; j++) {
    const p = sections[i][j];
    pos.push(p[0], p[1], p[2]);
    uv.push(i / (NS - 1), j / (NP - 1));
  }
  for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NP - 1; j++) {
    const a = i * NP + j, b = i * NP + j + 1, c = (i + 1) * NP + j, d = (i + 1) * NP + j + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/* 贴地：把几何整体抬/压到 min.y = y（斜靠着的东西用它落地） */
function groundify(g, y = 0) {
  g.computeBoundingBox();
  g.translate(0, y - g.boundingBox.min.y, 0);
  return g;
}

/* ── 接地阴影（AO 贴片）──────────────────────────────────────
   场景"贴纸化"的最大原因就是硬边坐在地上、底下一点不变暗。
   做法照 core/ao.js 的思路：铺一张径向渐变贴片，用 MultiplyBlending
   跟地面相乘。ao.js 提供共享贴图 + 共享材质，这里只把若干张贴片
   合成一个 mesh —— 全村几十件道具也只多 1 个 draw call。

   贴片本身是「圆盘 + 顶点色」：顶点色带强度，径向衰减靠共享贴图。 */
let _aoMat = null;
function aoMaterial() {
  if (_aoMat) return _aoMat;
  const src = aoPatch(1, .5).material;          /* 借 ao.js 的共享径向贴图 */
  _aoMat = new THREE.MeshBasicMaterial({
    map: src.map, transparent: true, depthWrite: false,
    blending: THREE.MultiplyBlending, vertexColors: true,
    side: THREE.FrontSide, toneMapped: false,
  });
  _aoMat.name = 'mat-props-ao';
  return _aoMat;
}
/* 一张椭圆接地阴影：rx/rz = 两个方向的半径，s = 强度，y = 离地高度 */
function aoDisc(x, z, rx, rz, s, y = 0.02, rot = 0) {
  const g = new THREE.CircleGeometry(1, 24);
  g.rotateX(-Math.PI / 2);
  /* 顶点色：中心按强度压暗，边缘回到白 */
  const pos = g.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3);
  const k = 1 - Math.max(0, Math.min(1, s));
  for (let i = 0; i < n; i++) {
    const d = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)));
    const v = 1 - k * Math.max(0, 1 - d * d);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(rx, 1, rz);
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}

/* ── 顶点色（深浅变化） ───────────────────────────────────────
   三层叠加，缺一个都"塑料"：
     ① 高度渐变 —— 底色暗、见光面亮（s0 → s1 随 y 走）
     ② 法线项 —— 朝上的面吃天光更亮，朝下/朝里的面更暗
     ③ 件间色差 —— 每根木料 / 每块石头自己一个色调（不随机数，用位置哈希）
   顶点色是逐顶点算的，但色差是「逐件」的（同一件里不抖），
   这样木头是"一根一根有色差"，不是"一片一片有噪点"。 */
function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
function tint(geo, rgb, rng, opt = {}) {
  const p = geo.attributes.position, n = p.count;
  const arr = new Float32Array(n * 3);
  const nrm = geo.attributes.normal;
  const y0 = opt.y0 ?? 0, y1 = opt.y1 ?? 1;
  const s0 = opt.s0 ?? .86, s1 = opt.s1 ?? 1.08;
  const jit = opt.jit ?? .07;
  const up = opt.up ?? .16;                 // 法线朝上的加成
  const grain = opt.grain ?? 0;             // 木纹色带
  /* 件间色差：以整件包围盒中心做哈希 —— 同一件里不抖 */
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) * .5, cy = (bb.min.y + bb.max.y) * .5, cz = (bb.min.z + bb.max.z) * .5;
  const tone = 1 + (hash3(cx * 3.1, cy * 2.7, cz * 3.3) - .5) * jit * 2;
  /* 竖着的件走竖纹，横着的件走横纹 */
  const bw = bb.max.x - bb.min.x, bh = bb.max.y - bb.min.y, bd = bb.max.z - bb.min.z;
  const vertical = bh > Math.max(bw, bd);
  const alongX = bw >= bd;
  for (let i = 0; i < n; i++) {
    let t = (p.getY(i) - y0) / Math.max(1e-4, y1 - y0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    let k = (s0 + (s1 - s0) * t) * tone;
    if (nrm) k *= 1 + up * nrm.getY(i);
    if (grain) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let gv;
      if (vertical) {
        const ang = Math.atan2(z - cz, x - cx);
        gv = Math.sin(ang * 7 + y * 0.5) * 0.62 + Math.sin(ang * 19) * 0.38;
      } else {
        const a = alongX ? (x - cx) : (z - cz);
        gv = Math.sin(a * 9 + y * 1.1) * 0.62 + Math.sin(a * 23) * 0.38;
      }
      k *= 1 + grain * gv;
    }
    arr[i * 3] = rgb[0] * k;
    arr[i * 3 + 1] = rgb[1] * k;
    arr[i * 3 + 2] = rgb[2] * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
/* 统一成 非索引 + 带 color，合并时才不会属性打架 */
function norm(geo) {
  const g = nonIndexed(geo);
  if (!g.attributes.color) {
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/* ── 收集器 ───────────────────────────────────────────────── */
let PENDING = null;             // 静态件：{bucket, geo, rgb, opt}
let SPIN = null;                // 筒车转动件：{bucket, geo, rgb, opt}
function emit(bucket, geo, rgb = [1, 1, 1], opt = {}) {
  PENDING.push({ bucket, geo, rgb, opt });
}
function emitSpin(bucket, geo, rgb = [1, 1, 1], opt = {}) {
  SPIN.push({ bucket, geo, rgb, opt });
}

/* ════════════════════════════════════════════════════════════
   井：石砌井圈 + 木辘轳 + 支架 + 吊桶
   尺寸：井圈外径 ≈1.42m、井圈高 0.50m；辘轳架高 1.48m、轴长 1.94m
   ════════════════════════════════════════════════════════════ */
function buildWell(rng) {
  const R = 0.60, BLK = 15, H = 0.50;
  /* 井圈：一圈石块，高低错落 */
  for (let i = 0; i < BLK; i++) {
    const a = (i / BLK) * Math.PI * 2;
    const h = H * (0.90 + rng() * 0.22);
    const g = boxG(0.22, h, 0.24, 0, 0, 0);
    g.rotateY(-a);
    g.translate(Math.cos(a) * R, h / 2, Math.sin(a) * R);
    emit('stone', g, [0.94 + rng() * 0.14, 0.96 + rng() * 0.10, 0.92 + rng() * 0.10],
      { y0: 0, y1: H, s0: .82, s1: 1.12, jit: .10 });
  }
  /* 井壁：从井口往下的一圈（看得见井有多深） */
  {
    const g = new THREE.CylinderGeometry(0.50, 0.50, 0.46, 16, 1, true);
    g.translate(0, 0.23, 0);
    emit('dark', g, [0.42, 0.44, 0.46], { y0: 0, y1: 0.5, s0: .55, s1: 1.05, jit: .06 });
  }
  /* 井底的水 */
  {
    const g = new THREE.CircleGeometry(0.50, 16);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.09, 0);
    emit('dark', g, [0.22, 0.34, 0.40], { s0: .9, s1: 1.1, jit: .05 });
  }
  /* 井台：环形石板（中间是空的，井口露出来） */
  {
    const g = latheG([
      [0.50, 0.00], [0.86, 0.00], [0.86, 0.11], [0.78, 0.13], [0.50, 0.11], [0.50, 0.00],
    ], 20);
    emit('stone', g, [0.88, 0.90, 0.86], { y0: 0, y1: 0.13, s0: .8, s1: 1.05, jit: .05 });
  }
  /* 辘轳架：两根立柱 + 顶梁 + 斜撑 */
  const PX = 0.86, TOP = 1.48;
  for (const sx of [-1, 1]) {
    emit('wood', boxG(0.11, TOP, 0.11, sx * PX, TOP / 2, 0), [1.02, 0.98, 0.92],
      { y0: 0, y1: TOP, s0: .72, s1: 1.06, jit: .07 });
    emit('wood', barG([sx * PX, 0.55, 0], [sx * 0.18, 1.26, 0], 0.075, 0.075), [0.95, 0.92, 0.88],
      { s0: .85, s1: 1.05, jit: .05 });
    emit('stone', boxG(0.24, 0.10, 0.24, sx * PX, 0.05, 0), [0.86, 0.88, 0.85],
      { s0: .85, s1: 1.0, jit: .05 });
  }
  emit('wood', barG([-PX, TOP - 0.06, 0], [PX, TOP - 0.06, 0], 0.10, 0.10), [1.0, 0.96, 0.90],
    { s0: .9, s1: 1.05, jit: .05 });
  /* 辘轳轴 + 辘轳筒 + 轴箍 */
  emit('wood', cylG(0.055, 1.94, [0, 1.26, 0], [1, 0, 0], 8), [1.05, 1.0, 0.92],
    { s0: .95, s1: 1.02, jit: .04 });
  emit('wood', cylG(0.145, 0.56, [0, 1.26, 0], [1, 0, 0], 12), [0.92, 0.86, 0.78],
    { s0: .92, s1: 1.02, jit: .06 });
  for (const dx of [-0.20, 0.20]) {
    emit('metal', ringG(0.15, 0.016, [dx, 1.26, 0], 'x', 12, 5), [1, 1, 1], { s0: .9, s1: 1.05, jit: .04 });
  }
  /* 缠在辘轳筒上的麻绳 + 垂到井里的绳 */
  for (let i = 0; i < 3; i++) {
    emit('fiber', ringG(0.152, 0.022, [-0.14 + i * 0.14, 1.26, 0], 'x', 12, 5), [0.92, 0.86, 0.72],
      { s0: .9, s1: 1.05, jit: .06 });
  }
  emit('fiber', cylG(0.014, 0.78, [0.05, 0.85, 0.02], [0, 1, 0], 5), [0.80, 0.74, 0.62],
    { s0: .95, s1: 1.02, jit: .04 });
  /* 吊桶 */
  emit('wood', cylG(0.13, 0.20, [0.05, 0.72, 0.02], [0, 1, 0], 10, 0.11), [1.0, 0.94, 0.86],
    { s0: .9, s1: 1.05, jit: .05 });
  emit('metal', ringG(0.135, 0.012, [0.05, 0.83, 0.02], 'z', 10, 5), [1, 1, 1], { s0: .9, s1: 1.05, jit: .04 });
  /* 一半的井盖：木板盖住半边井口 */
  if (rng() < 0.5) {
    for (let i = 0; i < 3; i++) {
      emit('wood', boxG(1.22, 0.05, 0.19, 0, 0.53, -0.26 + i * 0.21), [0.98, 0.93, 0.86],
        { s0: .9, s1: 1.05, jit: .06 });
    }
    emit('wood', boxG(0.08, 0.07, 0.66, 0.0, 0.58, -0.26), [1.02, 0.96, 0.88], { s0: .9, s1: 1.04, jit: .05 });
  }
}

/* ════════════════════════════════════════════════════════════
   晒谷架：竹木 A 架 + 横梁 + 挂串（玉米 / 辣椒 / 谷穗）
   尺寸：长 2.40m、高 1.95m、底脚张开 1.10m
   ════════════════════════════════════════════════════════════ */
function buildRack(rng) {
  const L = 2.40, H = 1.95, SPREAD = 0.55;
  /* 主梁（纵向） */
  emit('bamboo', cylG(0.055, L, [0, H, 0], [1, 0, 0], 8), [1.06, 1.08, 0.82],
    { s0: .82, s1: 1.08, jit: .07 });
  /* 两副 A 架 */
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 0.16);
    for (const sz of [-1, 1]) {
      emit('bamboo', groundify(barG([x, 0, sz * SPREAD], [x, H, 0], 0.075, 0.075), 0),
        [1.02, 1.05, 0.80], { y0: 0, y1: H, s0: .74, s1: 1.08, jit: .07 });
    }
    /* 横枨 */
    emit('bamboo', cylG(0.04, SPREAD * 2, [x, 0.95, 0], [0, 0, 1], 7), [0.98, 1.02, 0.78],
      { s0: .88, s1: 1.05, jit: .06 });
    /* 绑扎的横木（把 A 架捆在一起） */
    emit('bamboo', cylG(0.038, 0.9, [x, 0.5, 0], [0, 0, 1], 6), [0.95, 1.0, 0.76],
      { s0: .9, s1: 1.02, jit: .05 });
  }
  /* 纵向拉枨（把两副 A 架连起来，前后各一道） */
  for (const sz of [-1, 1]) {
    emit('bamboo', cylG(0.038, L - 0.3, [0, 0.92, sz * 0.30], [1, 0, 0], 7), [0.96, 1.0, 0.78],
      { s0: .88, s1: 1.03, jit: .06 });
  }
  /* 挂串：玉米 / 辣椒 / 谷穗 */
  const n = 8 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.35 + (L - 0.7) * (i + rng() * 0.6) / n;
    const drop = 0.16 + rng() * 0.10;
    const kind = rng();
    emit('fiber', cylG(0.008, drop, [x, H - drop / 2, 0], [0, 1, 0], 4), [0.82, 0.76, 0.62],
      { s0: .95, s1: 1.02, jit: .04 });
    const top = H - drop;
    if (kind < 0.45) {
      /* 玉米串：几棒玉米捆在一起 */
      const cnt = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < cnt; k++) {
        const a = (k / cnt) * Math.PI * 2 + rng();
        const ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05;
        emit('fiber', cylG(0.052, 0.26, [x + ox, top - 0.15, oz], [0, 1, 0], 8, 0.045),
          [1.18, 1.02, 0.46], { s0: .85, s1: 1.1, jit: .08 });
        emit('fiber', boxG(0.10, 0.14, 0.02, x + ox * 1.2, top - 0.20, oz * 1.2), [1.05, 0.98, 0.52],
          { s0: .9, s1: 1.05, jit: .06 });
      }
    } else if (kind < 0.75) {
      /* 辣椒串 */
      const cnt = 5 + Math.floor(rng() * 4);
      for (let k = 0; k < cnt; k++) {
        const a = rng() * Math.PI * 2, rr = 0.02 + rng() * 0.05;
        emit('red', cylG(0.028, 0.13, [x + Math.cos(a) * rr, top - 0.06 - k * 0.085, Math.sin(a) * rr],
          [0, -1, 0], 6, 0.012), [1.15, 0.72, 0.62], { s0: .85, s1: 1.1, jit: .08 });
      }
    } else {
      /* 谷穗 / 豆串 */
      emit('fiber', cylG(0.09, 0.30, [x, top - 0.16, 0], [0, -1, 0], 8, 0.02), [1.12, 1.0, 0.52],
        { s0: .85, s1: 1.08, jit: .08 });
      for (let k = 0; k < 3; k++) {
        const a = rng() * Math.PI * 2;
        emit('fiber', cylG(0.022, 0.20, [x + Math.cos(a) * 0.05, top - 0.18, Math.sin(a) * 0.05],
          [0, -1, 0], 5, 0.006), [1.05, 0.98, 0.55], { s0: .88, s1: 1.05, jit: .07 });
      }
    }
  }
  /* 靠着的两只圆晒匾 */
  for (let i = 0; i < 2; i++) {
    const g = new THREE.CylinderGeometry(0.40, 0.40, 0.05, 16);
    g.rotateX(1.15 + rng() * 0.15);
    g.translate(-L / 2 - 0.35 - i * 0.12, 0, 0.42 + i * 0.22);
    emit('bamboo', groundify(g, 0), [1.0, 1.0, 0.72], { s0: .88, s1: 1.05, jit: .06 });
  }
}

/* ════════════════════════════════════════════════════════════
   筒车（水车）：12 只辐射竹筒 + 双轮辋 + 16 轮辐 + 轮毂
                 + 木架 + 接水槽（接住提上来的水）
   尺寸：轮半径 0.95m、轮宽 0.48m、12 只竹筒
   定向：轮平面 = 局部 XY（顺着水流），轴 = 局部 Z（平行于岸）
        —— 水的推力推着轮底的竹筒，轮绕局部 Z 转
   高度：轴心 AXLE_Y = 0.90（相对地面基准 y=0）
        · 轮辋下缘 = -0.11（浮在水面上，水面 -0.16）
        · 竹筒口 = -0.53（探到河床 -0.60，不穿河床）
        · 筒顶 = 2.33
   坐标：全部按"轮中心 = 局部原点"造，整台车再放到河边
        （见 build() 里 waterwheel 的定位）
   转动件单独成组，挂在 group.userData.update 上
   ════════════════════════════════════════════════════════════ */
function buildWheel(rng) {
  const R = 0.95, HW = 0.24;
  const TUBES = 12, SPOKES = 8;
  const BED = -0.60;                    // 河床（terrain.js 的 RIVER_BED）
  const BR = R + 0.19;                  // 竹筒中心所在半径
  const BL = 0.38;                      // 竹筒长度
  /* 轮辋：前后两圈 */
  for (const sz of [-1, 1]) {
    emitSpin('wood', ringG(R, 0.055, [0, 0, sz * HW], 'z', 24, 6), [1.02, 0.98, 0.90],
      { s0: .92, s1: 1.05, jit: .05 });
    /* 连接两圈轮辋的横档 */
    for (let i = 0; i < TUBES; i++) {
      const a = (i / TUBES) * Math.PI * 2;
      emitSpin('bamboo', barG([Math.cos(a) * R, Math.sin(a) * R, -HW], [Math.cos(a) * R, Math.sin(a) * R, HW],
        0.045, 0.045), [1.0, 1.02, 0.78], { s0: .9, s1: 1.03, jit: .05 });
    }
  }
  /* 轮辐 */
  for (const sz of [-1, 1]) {
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2 + 0.2;
      emitSpin('wood', barG([Math.cos(a) * 0.14, Math.sin(a) * 0.14, sz * HW],
        [Math.cos(a) * (R - 0.04), Math.sin(a) * (R - 0.04), sz * HW], 0.055, 0.075),
        [0.96, 0.93, 0.86], { s0: .88, s1: 1.04, jit: .06 });
    }
  }
  /* 轮毂 */
  emitSpin('wood', cylG(0.13, 0.62, [0, 0, 0], [0, 0, 1], 12), [1.0, 0.94, 0.86],
    { s0: .92, s1: 1.03, jit: .05 });
  /* 竹筒：径向挂在轮缘外，筒口朝外（转到下面时兜水） */
  for (let i = 0; i < TUBES; i++) {
    const a = (i / TUBES) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    emitSpin('bamboo', cylG(0.105, BL, [ca * BR, sa * BR, 0], [ca, sa, 0], 10),
      [1.06, 1.06, 0.76], { s0: .86, s1: 1.08, jit: .07 });
    /* 筒口的箍 */
    emitSpin('bamboo', ringDirG(0.108, 0.015, [ca * (BR + BL / 2), sa * (BR + BL / 2), 0], [ca, sa, 0], 10, 5),
      [0.95, 0.98, 0.72], { s0: .92, s1: 1.02, jit: .04 });
    /* 筒底板 */
    emitSpin('bamboo', cylG(0.10, 0.03, [ca * (BR - BL / 2), sa * (BR - BL / 2), 0], [ca, sa, 0], 10),
      [0.94, 0.96, 0.72], { s0: .92, s1: 1.02, jit: .04 });
  }
  /* ── 静止部分（跟轮一起立在河边） ── */
  /* 轮毂箍：绕轴对称，转不转看不出来 —— 进静态桶（省一个 draw call） */
  emit('metal', ringG(0.135, 0.022, [0, AXLE_Y, 0.30], 'z', 12, 5), [1, 1, 1],
    { s0: .92, s1: 1.03, jit: .04 });
  emit('metal', ringG(0.135, 0.022, [0, AXLE_Y, -0.30], 'z', 12, 5), [1, 1, 1],
    { s0: .92, s1: 1.03, jit: .04 });
  /* 木架：两根立柱从河床撑到轴心以上（夹住轮面） */
  for (const sz of [-1, 1]) {
    emit('wood', boxG(0.15, AXLE_Y - BED + 0.34, 0.15, 0, (AXLE_Y + 0.34 + BED) / 2, sz * 0.62),
      [1.0, 0.96, 0.90], { y0: BED, y1: AXLE_Y + 0.34, s0: .72, s1: 1.06, jit: .07 });
    /* 斜撑 */
    emit('wood', barG([0, BED + 0.30, sz * 0.62], [0, AXLE_Y - 0.06, sz * 0.20], 0.08, 0.08),
      [0.94, 0.91, 0.86], { s0: .88, s1: 1.03, jit: .05 });
    /* 柱脚石墩（沉在河床上） */
    emit('stone', boxG(0.34, 0.36, 0.34, 0, BED + 0.18, sz * 0.62), [0.84, 0.86, 0.82],
      { s0: .8, s1: 1.02, jit: .05 });
  }
  /* 顶梁 */
  emit('wood', barG([0, AXLE_Y + 0.28, -0.70], [0, AXLE_Y + 0.28, 0.70], 0.11, 0.11),
    [1.0, 0.96, 0.90], { s0: .9, s1: 1.04, jit: .05 });
  /* 轴 */
  emit('wood', cylG(0.06, 1.44, [0, AXLE_Y, 0], [0, 0, 1], 8), [0.95, 0.92, 0.86],
    { s0: .95, s1: 1.02, jit: .04 });
  /* 接水槽：在轮顶的岸侧（局部 +Z），接住提上来的水 */
  {
    const TY = AXLE_Y + R + BL / 2 + 0.34;      // 槽底：比筒顶高一点
    const TZ = 0.72;
    const g = boxG(0.46, 0.10, 0.92, 0, TY, TZ);
    g.rotateX(-0.12);
    emit('wood', g, [1.0, 0.95, 0.88], { s0: .9, s1: 1.04, jit: .05 });
    /* 两条帮板 */
    for (const dx of [-0.21, 0.21]) {
      const w = boxG(0.06, 0.20, 0.94, dx, TY + 0.11, TZ);
      w.rotateX(-0.12);
      emit('wood', w, [0.96, 0.92, 0.86], { s0: .92, s1: 1.02, jit: .05 });
    }
    /* 撑槽的斜杆：从岸侧立柱拉到槽底 */
    emit('wood', barG([0, AXLE_Y + 0.20, 0.62], [0, TY, TZ], 0.09, 0.09), [0.92, 0.9, 0.85],
      { s0: .85, s1: 1.02, jit: .05 });
    /* 出水槽尾：往岸上斜伸 */
    const sp = boxG(0.42, 0.10, 0.80, 0, TY - 0.02, TZ + 0.62);
    sp.rotateX(-0.26);
    emit('wood', sp, [0.98, 0.94, 0.87], { s0: .9, s1: 1.03, jit: .05 });
  }
}

/* ════════════════════════════════════════════════════════════
   乌篷船：放样船壳（两头翘）+ 船帮 + 内壳 + 肋骨 + 乌篷 + 竹篙
   尺寸：长 3.55m、宽 1.10m、舷高 0.36m（两端翘到 0.70m）
   局部 y=0 = 设计水线，整船落到 y = WATER_Y
   ════════════════════════════════════════════════════════════ */
function hullSection(u) {
  const s = Math.sin(Math.PI * u);
  const endT = Math.abs(2 * u - 1);
  return {
    halfB: (BOAT_B / 2) * Math.pow(Math.max(s, 0.0001), 0.50) + 0.022,
    sheer: 0.52 + 0.34 * Math.pow(endT, 2.2),     // 舷线：两端翘起（干舷 0.52m）
    keel: -0.22 + 0.50 * Math.pow(endT, 1.4),      // 龙骨：两端也翘（翘头翘尾）
  };
}
/* 船壳横剖面控制点 [半宽比, 高比] */
const HULL_P = [[0, 0], [0.50, 0.08], [0.82, 0.34], [1, 1]];
function hullHalf(n) {
  const out = [];
  const seg = HULL_P.length - 1;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let k = 0;
    while (k < seg - 1 && t > (k + 1) / seg) k++;
    const t0 = k / seg, t1 = (k + 1) / seg;
    const f = (t - t0) / Math.max(1e-6, t1 - t0);
    const a = HULL_P[k], b = HULL_P[k + 1];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
function buildBoat(rng) {
  const NS = 15, NP = 7;
  const half = hullHalf(NP);
  const outer = [], inner = [], rimP = [], rimS = [];
  for (let i = 0; i < NS; i++) {
    const u = i / (NS - 1);
    const x = -BOAT_L / 2 + u * BOAT_L;
    const S = hullSection(u);
    const Si = { halfB: Math.max(S.halfB - 0.055, 0.012), sheer: S.sheer - 0.045, keel: S.keel + 0.055 };
    const op = [], ip = [];
    for (let k = half.length - 1; k >= 0; k--) {          // 左舷 → 龙骨
      const [wf, yf] = half[k];
      op.push([x, S.keel + yf * (S.sheer - S.keel), -wf * S.halfB]);
      ip.push([x, Si.keel + yf * (Si.sheer - Si.keel), -wf * Si.halfB]);
    }
    for (let k = 1; k < half.length; k++) {                // 龙骨 → 右舷
      const [wf, yf] = half[k];
      op.push([x, S.keel + yf * (S.sheer - S.keel), wf * S.halfB]);
      ip.push([x, Si.keel + yf * (Si.sheer - Si.keel), wf * Si.halfB]);
    }
    outer.push(op);
    inner.push(ip.reverse());
    rimP.push([op[0], ip[0]]);
    rimS.push([ip[ip.length - 1], op[op.length - 1]]);
  }
  emit('wood', loft(outer), [1.0, 0.96, 0.90], { y0: -0.25, y1: 0.72, s0: .74, s1: 1.08, jit: .05 });
  emit('wood', loft(inner), [0.86, 0.83, 0.78], { y0: -0.25, y1: 0.72, s0: .70, s1: 1.0, jit: .05 });
  emit('wood', loft(rimP), [1.05, 1.0, 0.92], { s0: .9, s1: 1.06, jit: .04 });
  emit('wood', loft(rimS), [1.05, 1.0, 0.92], { s0: .9, s1: 1.06, jit: .04 });
  /* 船帮（舷口上的一圈木条） */
  for (const side of [-1, 1]) {
    for (let i = 0; i < NS - 1; i++) {
      const S1 = hullSection(i / (NS - 1)), S2 = hullSection((i + 1) / (NS - 1));
      const a = [-BOAT_L / 2 + (i / (NS - 1)) * BOAT_L, S1.sheer + 0.03, side * S1.halfB];
      const b = [-BOAT_L / 2 + ((i + 1) / (NS - 1)) * BOAT_L, S2.sheer + 0.03, side * S2.halfB];
      emit('wood', barG(a, b, 0.075, 0.055), [1.05, 1.0, 0.93], { s0: .9, s1: 1.05, jit: .05 });
    }
  }
  /* 肋骨：内壳上的骨架 */
  for (let k = 1; k <= 4; k++) {
    const u = 0.14 + k * 0.18;
    const S = hullSection(u);
    const x = -BOAT_L / 2 + u * BOAT_L;
    const pts = [];
    for (let j = 0; j < half.length; j++) {
      const [wf, yf] = half[j];
      pts.push([x, S.keel + yf * (S.sheer - S.keel) + 0.06, wf * (S.halfB - 0.05)]);
    }
    for (let j = 0; j < pts.length - 1; j++) {
      emit('wood', barG(pts[j], pts[j + 1], 0.055, 0.05), [0.96, 0.92, 0.86], { s0: .9, s1: 1.02, jit: .05 });
    }
    for (let j = pts.length - 2; j >= 0; j--) {
      emit('wood', barG(pts[j], [x, pts[j][1], -pts[j][2]], 0.055, 0.05), [0.96, 0.92, 0.86],
        { s0: .9, s1: 1.02, jit: .05 });
    }
  }
  /* 舱底板 + 座板 */
  emit('wood', boxG(2.05, 0.045, 0.52, 0, 0.14, 0), [0.98, 0.94, 0.87], { s0: .92, s1: 1.03, jit: .05 });
  emit('wood', boxG(0.20, 0.05, 0.86, -0.60, 0.36, 0), [1.02, 0.97, 0.90], { s0: .92, s1: 1.04, jit: .05 });
  /* 乌篷：半圆拱顶 + 两头半圆封板 + 竹篷骨 */
  {
    const R = 0.42, LEN = 1.60, CX = -0.18, CY = 0.50;
    const dome = new THREE.CylinderGeometry(R, R, LEN, 18, 1, true, 0, Math.PI);
    dome.rotateZ(Math.PI / 2);
    dome.translate(CX, CY, 0);
    emit('glaze', dome, [0.20, 0.20, 0.22], { s0: .85, s1: 1.1, jit: .06 });
    for (const sx of [-1, 1]) {
      const cap = new THREE.CircleGeometry(R, 18, 0, Math.PI);
      cap.rotateY(Math.PI / 2);
      cap.translate(CX + sx * LEN / 2, CY, 0);
      emit('glaze', cap, [0.18, 0.18, 0.20], { s0: .9, s1: 1.05, jit: .05 });
    }
    for (let k = 0; k < 4; k++) {
      const x = CX - LEN / 2 + LEN * (k + 0.5) / 4;
      const t = new THREE.TorusGeometry(R + 0.012, 0.022, 5, 14, Math.PI);
      t.rotateY(Math.PI / 2);
      t.translate(x, CY, 0);
      emit('bamboo', t, [1.02, 1.02, 0.74], { s0: .9, s1: 1.05, jit: .05 });
    }
    emit('bamboo', cylG(0.022, LEN, [CX, CY - 0.02, 0], [1, 0, 0], 5), [1.0, 1.0, 0.75],
      { s0: .92, s1: 1.02, jit: .04 });
  }
  /* 竹篙：两根斜搭在船上 */
  for (let k = 0; k < 2; k++) {
    const a = [-1.1 + k * 0.25, 0.28 + k * 0.06, -0.55];
    const b = [0.95 + k * 0.30, 0.04, 0.62];
    emit('bamboo', barG(a, b, 0.045, 0.045), [1.04, 1.04, 0.76], { s0: .82, s1: 1.08, jit: .06 });
  }
  /* 船头缆桩 */
  emit('wood', cylG(0.06, 0.22, [BOAT_L / 2 - 0.22, 0.46, 0], [0, 1, 0], 6), [1.0, 0.96, 0.9],
    { s0: .9, s1: 1.03, jit: .04 });
}

/* ════════════════════════════════════════════════════════════
   酱缸：鼓腹陶缸 + 厚缸沿 + 酱面 + 木盖 + 缸脚石圈
   尺寸：最大腹径 0.94m、高 0.68m
   ════════════════════════════════════════════════════════════ */
function buildJar(rng) {
  const PROFILE = [
    [0.001, 0.00], [0.30, 0.00], [0.37, 0.05], [0.44, 0.20],
    [0.47, 0.36], [0.45, 0.50], [0.40, 0.60], [0.40, 0.68],
    [0.34, 0.68], [0.34, 0.61], [0.39, 0.50], [0.40, 0.34],
    [0.36, 0.18], [0.28, 0.05], [0.001, 0.04],
  ];
  const tone = 0.86 + rng() * 0.26;
  /* 陶身：深褐釉面（顶点色做深浅变化，缸与缸不一样） */
  emit('jar', latheG(PROFILE, 20), [tone * 1.02, tone * 0.88, tone * 0.80],
    { y0: 0, y1: 0.7, s0: .80, s1: 1.10, jit: .06 });
  /* 缸里的酱面 */
  {
    const s = new THREE.CircleGeometry(0.335, 18);
    s.rotateX(-Math.PI / 2);
    s.translate(0, 0.60, 0);
    emit('dark', s, [0.34, 0.24, 0.16], { s0: .9, s1: 1.06, jit: .05 });
  }
  /* 木盖：半盖，露出一口酱 */
  if (rng() < 0.68) {
    const lid = new THREE.CylinderGeometry(0.40, 0.40, 0.045, 18, 1, false, -Math.PI / 2, Math.PI);
    lid.translate(-0.02, 0.70, 0);
    emit('wood', lid, [1.0, 0.95, 0.87], { s0: .9, s1: 1.04, jit: .05 });
    emit('wood', boxG(0.30, 0.05, 0.07, -0.02, 0.745, 0), [1.02, 0.97, 0.9], { s0: .92, s1: 1.02, jit: .04 });
  }
  /* 缸脚的石圈 */
  {
    const r = ringG(0.42, 0.03, [0, 0.03, 0], 'y', 16, 5);
    emit('stone', r, [0.86, 0.86, 0.82], { s0: .9, s1: 1.02, jit: .04 });
  }
}

/* ════════════════════════════════════════════════════════════
   灯笼：竹灯杆 + 铜挂环 + 纸罩 + 竹骨 + 上下盖 + 流苏
   尺寸：杆高 2.10m、灯笼半径 0.19m、高 0.34m
   ════════════════════════════════════════════════════════════ */
function buildLantern(rng) {
  const POLE = 2.10, ARM = 0.46, CY = 1.58;
  emit('stone', boxG(0.30, 0.12, 0.30, 0, 0.06, 0), [0.86, 0.87, 0.83], { s0: .85, s1: 1.0, jit: .05 });
  emit('bamboo', cylG(0.055, POLE, [0, POLE / 2, 0], [0, 1, 0], 8), [1.04, 1.06, 0.80],
    { y0: 0, y1: POLE, s0: .76, s1: 1.08, jit: .07 });
  emit('bamboo', barG([0, POLE - 0.08, 0], [ARM, POLE - 0.16, 0], 0.045, 0.045), [1.0, 1.02, 0.78],
    { s0: .9, s1: 1.02, jit: .05 });
  emit('bamboo', barG([0, POLE - 0.42, 0], [ARM * 0.7, POLE - 0.15, 0], 0.035, 0.035), [0.96, 0.99, 0.76],
    { s0: .9, s1: 1.0, jit: .04 });
  /* 挂环 + 挂绳 */
  emit('metal', ringG(0.045, 0.012, [ARM, POLE - 0.22, 0], 'z', 10, 5), [1, 1, 1], { s0: .9, s1: 1.04, jit: .04 });
  emit('fiber', cylG(0.010, 0.10, [ARM, POLE - 0.28, 0], [0, 1, 0], 4), [0.82, 0.76, 0.62],
    { s0: .95, s1: 1.02, jit: .03 });
  /* 灯笼纸罩 */
  {
    const s = new THREE.SphereGeometry(0.19, 16, 12);
    s.scale(1, 0.88, 1);
    s.translate(ARM, CY, 0);
    emit('paper', s, [1.0, 0.98, 0.92], { y0: CY - 0.2, y1: CY + 0.2, s0: .88, s1: 1.08, jit: .05 });
  }
  /* 竹骨：8 根竖骨 + 上下两道箍 */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 0.188;
    emit('bamboo', cylG(0.011, 0.30, [ARM + Math.cos(a) * r, CY, Math.sin(a) * r], [0, 1, 0], 4),
      [1.02, 1.02, 0.76], { s0: .92, s1: 1.02, jit: .05 });
  }
  emit('bamboo', ringG(0.115, 0.012, [ARM, CY + 0.155, 0], 'y', 12, 5), [1.0, 1.0, 0.75],
    { s0: .92, s1: 1.02, jit: .04 });
  emit('bamboo', ringG(0.115, 0.012, [ARM, CY - 0.155, 0], 'y', 12, 5), [1.0, 1.0, 0.75],
    { s0: .92, s1: 1.02, jit: .04 });
  /* 上下盖 */
  emit('bamboo', cylG(0.075, 0.035, [ARM, CY + 0.175, 0], [0, 1, 0], 10), [0.98, 0.96, 0.74],
    { s0: .92, s1: 1.02, jit: .04 });
  emit('bamboo', cylG(0.070, 0.030, [ARM, CY - 0.175, 0], [0, 1, 0], 10), [0.98, 0.96, 0.74],
    { s0: .92, s1: 1.02, jit: .04 });
  /* 流苏 */
  emit('red', cylG(0.026, 0.07, [ARM, CY - 0.225, 0], [0, 1, 0], 6), [1.1, 0.8, 0.7], { s0: .9, s1: 1.05, jit: .04 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    emit('red', cylG(0.008, 0.16, [ARM + Math.cos(a) * 0.022, CY - 0.33, Math.sin(a) * 0.022],
      [0, -1, 0], 4, 0.004), [1.12, 0.82, 0.72], { s0: .88, s1: 1.05, jit: .06 });
  }
}

/* ════════════════════════════════════════════════════════════
   笼舍：竹桩围栏 + 竹笼 + 竹筐堆 + 蛇篓
   尺寸：栏高 0.78m、笼半径 0.30m
   ════════════════════════════════════════════════════════════ */
function buildPen(rng) {
  const W = 1.60, D = 1.25, H = 0.78;
  const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
  for (const [x, z] of corners) {
    emit('bamboo', cylG(0.045, H, [x, H / 2, z], [0, 1, 0], 7), [1.04, 1.04, 0.78],
      { y0: 0, y1: H, s0: .74, s1: 1.08, jit: .07 });
  }
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    if (i === 3 && rng() < 0.5) continue;          // 留个口子
    for (const y of [0.34, 0.66]) {
      emit('bamboo', barG([a[0], y, a[1]], [b[0], y, b[1]], 0.032, 0.032), [0.98, 1.0, 0.76],
        { s0: .88, s1: 1.03, jit: .05 });
    }
  }
  /* 竹笼（禽笼）：竖条 + 横箍 + 顶篷 */
  const CR = 0.30, CH = 0.46;
  const cx = -0.34 + rng() * 0.2, cz = -0.20 + rng() * 0.2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    emit('bamboo', cylG(0.014, CH, [cx + Math.cos(a) * CR, CH / 2, cz + Math.sin(a) * CR], [0, 1, 0], 4),
      [1.02, 1.02, 0.76], { y0: 0, y1: CH, s0: .80, s1: 1.05, jit: .06 });
  }
  for (let k = 0; k < 4; k++) {
    const y = 0.06 + k * (CH - 0.10) / 3;
    emit('bamboo', ringG(CR + 0.012, 0.016, [cx, y, cz], 'y', 14, 5), [0.98, 1.0, 0.74],
      { s0: .9, s1: 1.03, jit: .05 });
  }
  {
    const g = new THREE.ConeGeometry(CR + 0.06, 0.22, 12, 1, true);
    g.translate(cx, CH + 0.10, cz);
    emit('bamboo', g, [1.04, 1.02, 0.72], { s0: .85, s1: 1.05, jit: .05 });
    emit('bamboo', ringG(CR + 0.05, 0.018, [cx, CH + 0.02, cz], 'y', 14, 5), [0.96, 0.98, 0.72],
      { s0: .9, s1: 1.02, jit: .04 });
  }
  /* 笼底竹板 */
  emit('bamboo', cylG(CR, 0.03, [cx, 0.015, cz], [0, 1, 0], 14), [0.94, 0.96, 0.70], { s0: .9, s1: 1.0, jit: .04 });
  /* 堆起来的竹筐 */
  const stackX = 0.42, stackZ = 0.16;
  for (let k = 0; k < 3; k++) {
    const R = 0.26 - k * 0.012, Hh = 0.20;
    const bx = stackX + (rng() - .5) * 0.05, bz = stackZ + (rng() - .5) * 0.05;
    const by = k === 2 ? 0.0 : 0.02 + k * (Hh + 0.02);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      emit('bamboo', cylG(0.014, Hh, [bx + Math.cos(a) * R, by + Hh / 2, bz + Math.sin(a) * R], [0, 1, 0], 4),
        [1.02, 1.02, 0.76], { y0: 0, y1: 1, s0: .82, s1: 1.05, jit: .06 });
    }
    for (let j = 0; j < 3; j++) {
      const y = by + 0.04 + j * (Hh - 0.08) / 2;
      emit('bamboo', ringG(R + 0.012, 0.016, [bx, y, bz], 'y', 12, 5), [0.98, 1.0, 0.74],
        { s0: .9, s1: 1.03, jit: .05 });
    }
    emit('bamboo', cylG(R, 0.03, [bx, by + 0.015, bz], [0, 1, 0], 12), [0.94, 0.96, 0.70],
      { s0: .9, s1: 1.0, jit: .04 });
    if (k === 2) {
      emit('bamboo', cylG(R + 0.02, 0.03, [bx, by + Hh, bz], [0, 1, 0], 12), [0.94, 0.96, 0.70],
        { s0: .9, s1: 1.0, jit: .04 });
    }
  }
  /* 蛇篓：细长的竹篓，斜靠在笼边 */
  {
    const sx = -0.05, sz = 0.42, tilt = 0.28;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const g = cylG(0.013, 0.52, [Math.cos(a) * 0.13, 0.26, Math.sin(a) * 0.13], [0, 1, 0], 4);
      g.rotateX(tilt);
      g.translate(sx, 0, sz);
      emit('bamboo', groundify(g, 0), [1.0, 1.0, 0.74], { s0: .82, s1: 1.04, jit: .06 });
    }
    for (let j = 0; j < 4; j++) {
      const g = ringG(0.14, 0.014, [0, 0.06 + j * 0.14, 0], 'y', 12, 5);
      g.rotateX(tilt);
      g.translate(sx, 0, sz);
      emit('bamboo', groundify(g, 0), [0.96, 0.98, 0.72], { s0: .9, s1: 1.02, jit: .05 });
    }
  }
}

/* ════════════════════════════════════════════════════════════
   篱笆（SPEC 里有、当前布局未生成，先备着）
   ════════════════════════════════════════════════════════════ */
function buildFence(rng) {
  const L = 2.2, H = 0.72;
  const n = Math.round(L / 0.35);
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + L * i / n;
    const h = H * (0.9 + rng() * 0.2);
    emit('bamboo', cylG(0.035, h, [x, h / 2, (rng() - .5) * 0.06], [0, 1, 0], 6), [1.04, 1.04, 0.78],
      { y0: 0, y1: H, s0: .76, s1: 1.06, jit: .07 });
  }
  for (const y of [0.28, 0.58]) {
    emit('bamboo', cylG(0.026, L, [0, y, 0], [1, 0, 0], 6), [0.98, 1.0, 0.76], { s0: .88, s1: 1.03, jit: .05 });
  }
}

/* ── 合并 & 出图 ──────────────────────────────────────────── */
function bucketMaterial(key) {
  const b = BUCKETS.find(x => x.key === key);
  const m = MAT[b.base].clone();
  m.vertexColors = true;
  m.name = 'mat-props-' + key;
  if (key === 'paper') { m.map = MAT.paper.map; m.needsUpdate = true; }
  if (key === 'glaze') { m.color = new THREE.Color(0x2b2522); m.roughness = .62; }  // 乌篷：近黑的桐油竹篾
  if (key === 'jar') { m.color = new THREE.Color(0x6d3f24); m.roughness = .46; }     // 酱缸：深褐釉面
  if (key === 'bamboo') m.color = new THREE.Color(0xa89a68);  // 竹青偏黄（压得住，别发白）
  if (key === 'wood') m.color = new THREE.Color(0xb08a63);    // 木料：贴图自带褐，color 只能压到这里
  if (key === 'stone') m.color = new THREE.Color(0xbdb8ab);   // 石：冷灰，靠顶点色压出明暗
  /* 铜件 / 铁箍：吃环境反射（金属度高、粗糙度低），
     天空一照就有高光，不再是"贴上去的塑料环" */
  if (key === 'metal') { m.color = new THREE.Color(0xc9a463); m.metalness = .92; m.roughness = .24; }
  /* 井壁 / 船壳 / 乌篷都有"从里往外看"的一面 */
  if (key === 'dark' || key === 'glaze' || key === 'wood') m.side = THREE.DoubleSide;
  return m;
}
function mergeMesh(list, mat, name) {
  if (!list.length) return null;
  const g = mergeGeometries(list, false);
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* 筒车的落位：布局给的 gx/gz 是拿世界坐标当格号算的（layout.js 里的
   Math.round(r.z1 / cell)），结果筒车会离河心一百多米。这里不跟布局的
   坏坐标走，直接按 layout.rivers 反推：沿河取一段、横向挪到岸边。
   返回 {x, z, rot} —— 轮平面顺着水流，轴平行于岸。 */
function wheelSpot(layout, pr, rng) {
  const rs = (layout && layout.rivers) || [];
  if (!rs.length) return { x: pr.x, z: pr.z, rot: pr.rot || 0 };
  /* 找离布局给的点最近的那条河 */
  let best = rs[0], bd = 1e9;
  for (const r of rs) {
    const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    const d = Math.hypot(cx - (pr.x || 0), cz - (pr.z || 0));
    if (d < bd) { bd = d; best = r; }
  }
  const horiz = best.horiz !== false;
  const half = (best.w || 12) / 2;
  /* 沿河方向：取一个落在河段内的位置 */
  let along;
  if (horiz) {
    const lo = Math.min(best.x1, best.x2) + 8, hi = Math.max(best.x1, best.x2) - 8;
    along = rng.range(lo, hi);
  } else {
    const lo = Math.min(best.z1, best.z2) + 8, hi = Math.max(best.z1, best.z2) - 8;
    along = rng.range(lo, hi);
  }
  /* 横向：贴着一边的岸，留 1.2m 让轮子探进水里 */
  const off = half - 1.2;
  if (horiz) {
    const cz = (best.z1 + best.z2) / 2;
    return { x: along, z: cz + off, rot: 0 };
  }
  const cx = (best.x1 + best.x2) / 2;
  return { x: cx + off, z: along, rot: Math.PI / 2 };
}

export function build(layout) {
  initMaterials();
  const group = new THREE.Group();
  group.name = 'model-props';

  const seed = (typeof layout.seed === 'number' ? layout.seed : parseInt(String(layout.seed), 10) || 0) | 0;
  const rng = makeRng(seed ^ SEED_XOR);

  const buckets = {};
  for (const b of BUCKETS) buckets[b.key] = [];
  const mats = {};
  for (const b of BUCKETS) mats[b.key] = bucketMaterial(b.key);
  /* 木料 / 石料：贴图自带深色，材质色别再压深 —— 不然木头成一团黑漆 */
  mats.wood.color.setRGB(1.34, 1.14, 0.86);
  mats.stone.color.setRGB(1.06, 1.03, 0.94);

  const props = (layout && layout.props) ? layout.props : [];
  const spins = [];
  const byKind = {};
  const aoSpecs = [];                        // 接地阴影贴片清单

  /* 每件道具脚下的软影：半径按实际占地，强度 .40~.55 */
  const AO_OF = {
    well: [1.30, .54], dryingrack: [1.60, .46], jar: [0.68, .50],
    lamp: [0.62, .44], lantern: [0.62, .44], pen: [1.10, .46], fence: [1.30, .40],
  };

  for (const pr of props) {
    if (!pr) continue;
    const kind = pr.kind;
    byKind[kind] = (byKind[kind] || 0) + 1;
    PENDING = [];
    SPIN = [];
    let baseY = 0;
    /* 落位：默认就用布局给的 x/z；筒车例外（布局的格号是坏的，按河反推） */
    let px = pr.x || 0, pz = pr.z || 0, prot = pr.rot || 0;
    switch (kind) {
      case 'well': buildWell(rng); break;
      case 'dryingrack': buildRack(rng); break;
      case 'jar': buildJar(rng); break;
      case 'lamp': case 'lantern': buildLantern(rng); break;
      case 'pen': buildPen(rng); break;
      case 'boat': buildBoat(rng); baseY = WATER_Y; break;
      case 'fence': buildFence(rng); break;
      case 'waterwheel': {
        const spot = wheelSpot(layout, pr, rng);
        px = spot.x; pz = spot.z; prot = spot.rot;
        buildWheel(rng);
        break;
      }
      default: break;
    }
    const rot = prot;

    /* ── 接地阴影 ── */
    if (kind === 'boat') {
      /* 船在水上：影要落在水面（-0.16 略上），而且是细长的椭圆，强度很淡 */
      aoSpecs.push({ x: px, z: pz, rx: 1.95, rz: 0.86, s: .25, y: -0.125, rot });
    } else if (kind === 'waterwheel') {
      /* 筒车立在河里：水里一圈很淡的影 + 岸上一圈落地影 */
      aoSpecs.push({ x: px, z: pz, rx: 1.25, rz: 1.05, s: .22, y: -0.125, rot });
      const bank = 2.15;                       /* 岸在轮心的 +Z 方向 1.2m 之外 */
      aoSpecs.push({
        x: px + Math.sin(rot) * bank, z: pz + Math.cos(rot) * bank,
        rx: 1.05, rz: 0.95, s: .36, y: 0.02,
      });
    } else if (AO_OF[kind]) {
      const [r, s] = AO_OF[kind];
      aoSpecs.push({ x: px, z: pz, rx: r, rz: r * .92, s, y: 0.04 });
    }
    /* 静态件：转 → 移位 → 上色 → 进桶 */
    for (const it of PENDING) {
      const g = norm(it.geo);
      g.rotateY(rot);
      g.translate(px, baseY, pz);
      /* 木料件自动带木纹色带：不是一根纯色圆柱 */
      const opt = it.bucket === 'wood' ? Object.assign({ grain: .10 }, it.opt) : it.opt;
      tint(g, it.rgb, rng, opt);
      buckets[it.bucket].push(g);
    }
    /* 筒车：转动件单独成组（轴心 = 局部 Z）
       注意：这里的几何是"轮自身坐标"（轮心在原点），不能再转 rot ——
       外层 root 已经带了 rotation.y = rot，转两次会歪。 */
    if (SPIN.length) {
      const spin = new THREE.Group();
      spin.position.y = AXLE_Y;
      const local = {};
      for (const it of SPIN) {
        const g = norm(it.geo);
        tint(g, it.rgb, rng, it.opt);
        (local[it.bucket] = local[it.bucket] || []).push(g);
      }
      for (const key of Object.keys(local)) {
        const m = mergeMesh(local[key], mats[key], 'props-wheel-' + key);
        if (m) spin.add(m);
      }
      const root = new THREE.Group();
      root.name = 'props-waterwheel';
      root.position.set(px, 0, pz);
      root.rotation.y = rot;
      root.add(spin);
      group.add(root);
      spins.push(spin);
    }
    PENDING = null;
    SPIN = null;
  }

  /* 出 mesh：一个桶一个 */
  let drawCalls = 0;
  for (const b of BUCKETS) {
    const m = mergeMesh(buckets[b.key], mats[b.key], 'props-' + b.key);
    if (m) { group.add(m); drawCalls++; }
  }
  for (const root of group.children) {
    if (root.name === 'props-waterwheel') drawCalls += root.children[0].children.length;
  }

  /* 接地阴影：全部贴片合成一个 mesh（只多 1 个 draw call）
     放在最后加，renderOrder 2 保证压在地面之后、道具之前混合 */
  if (aoSpecs.length) {
    /* 圆贴片走 core/ao.js 的 aoBatch（共享贴图 + 共享材质）；
       椭圆/水面上的（船、筒车）保留自绘贴片。 */
    const geos = [];
    const round = aoSpecs.filter(a => a.y >= 0.03);
    const odd = aoSpecs.filter(a => a.y < 0.03);
    if (round.length) {
      const pts = round.map(a => ({ x: a.x, z: a.z, r: a.rx, s: a.s }));
      for (const g of aoBatch(pts, aoMaterial())) { g.translate(0, 0.02, 0); geos.push(g); }
    }
    for (const a of odd) geos.push(aoDisc(a.x, a.z, a.rx, a.rz, a.s, a.y, a.rot || 0));
    const aoMesh = new THREE.Mesh(mergeGeometries(geos, false), aoMaterial());
    aoMesh.name = 'props-ao';
    aoMesh.renderOrder = 2;
    aoMesh.castShadow = false;
    aoMesh.receiveShadow = false;
    aoMesh.matrixAutoUpdate = false;
    group.add(aoMesh);
    drawCalls++;
  }

  /* 筒车转动：main.js 每帧遍历调用 */
  group.userData = {
    update(t, dt) {
      for (const s of spins) s.rotation.z += dt * 0.42;
    },
    props: props.length,
    byKind,
    drawCalls,
  };
  return group;
}
