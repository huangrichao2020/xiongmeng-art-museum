/* 江南古村 · 树木模型（松 / 竹 / 柳 / 榆 / 银杏）
   ------------------------------------------------------------------
   · 规范空间：每棵树先在 0~6m 的"标准树"空间里造好，再用树种系数 FT
     缩到目标高度，最后乘 layout.trees[i].scale：
       松 6.0m / 竹 4.7m / 柳 3.8m / 榆 5.1m / 银杏 5.2m
   · 一棵树的木质件与叶片件共用同一套变换（位置 / 绕Y旋转 / 缩放），
     所以树冠一定长在树干上；所有部件根部都压在 y=0 的地面上。
   · 木质件按形状合流：松 + 榆 共用"带分叉树干"，银杏用"直干"，
     柳用"矮干 + 拱枝"，共 3 个木质 InstancedMesh。
   · 8 个 InstancedMesh = 8 个 draw call（不管 500 棵还是 1700 棵）。
   · 材质全部从 core/materials.js 的 MAT.leaf 系列 / MAT.bark 克隆而来
     （共享贴图不变，只调色 + 开 vertexColors 做树冠深浅），
     每棵树再叠一层 instanceColor 做轻微色差。 */
import * as THREE from 'three';
import { mergeGeometries, instancedMerge } from '../core/geo.js';
import { MAT, initMaterials } from '../core/materials.js';
import { makeRng } from '../core/rng.js';

const UP = new THREE.Vector3(0, 1, 0);
const TYPES = ['pine', 'bamboo', 'willow', 'elm', 'gingko'];

/* 规范空间 6m → 各树种成品高度 */
const FT = { pine: 0.96, bamboo: 0.74, willow: 0.68, elm: 0.85, gingko: 0.86 };

/* 每棵树的轻微色差（instanceColor 乘算） */
const TINT = {
  pine: [0.94, 1.02, 0.97],
  bamboo: [1.04, 1.02, 0.90],
  willow: [0.96, 1.03, 0.98],
  elm: [1.00, 1.00, 1.00],
  gingko: [1.06, 0.98, 0.84],
};

/* ── 几何小工具 ───────────────────────────────────────────────── */
function coneGeo(r, h, seg = 6, flat = 1) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, h / 2, 0);                 // 底面落在 y=0
  if (flat !== 1) g.scale(1, flat, 1);
  return g;
}

function ballGeo(r, seg = 6, ring = 4, flat = 1) {
  const g = new THREE.SphereGeometry(r, seg, ring);
  if (flat !== 1) g.scale(1, flat, 1);
  return g;
}

/* 圆柱枝干：from → to，r0 根部粗、r1 梢头细（锥度） */
function branch(from, to, r0, r1, seg = 6) {
  const a = new THREE.Vector3(from[0], from[1], from[2]);
  const b = new THREE.Vector3(to[0], to[1], to[2]);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(1e-4, dir.length());
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/* 弯管：竹竿、柳条 */
function tubeGeo(pts, radius, radial = 4, tub = 5) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, tub, radius, radial, false);
}

/* 根盘：底面贴地、往上收的圆锥 */
function flareGeo(r, h, seg = 6) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, h / 2, 0);
  g.scale(1, .82, 1);
  return g;
}

/* 顶点色：rgb 是色偏，s0→s1 是由下到上的明暗梯度 */
function tint(geo, rgb, o = {}) {
  const p = geo.attributes.position, n = p.count;
  const arr = new Float32Array(n * 3);
  const y0 = o.y0 ?? 0, y1 = o.y1 ?? 1;
  const s0 = o.s0 ?? .78, s1 = o.s1 ?? 1.12;
  const jit = o.jit ?? .07;
  const rr = makeRng(o.seed ?? 1);
  for (let i = 0; i < n; i++) {
    let t = (p.getY(i) - y0) / Math.max(1e-4, y1 - y0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    let k = s0 + (s1 - s0) * t;
    k *= 1 + (rr() - .5) * jit * 2;
    arr[i * 3] = rgb[0] * k;
    arr[i * 3 + 1] = rgb[1] * k;
    arr[i * 3 + 2] = rgb[2] * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function weld(parts) {
  return mergeGeometries(parts, false);
}

/* ── 木质件 ───────────────────────────────────────────────────── */
/* 松 + 榆：主干（带锥度、两段微弯）+ 分叉枝 */
function woodForked() {
  const parts = [
    flareGeo(.44, .58, 6),
    branch([0, 0, 0], [.05, 1.80, .02], .27, .20, 7),
    branch([.05, 1.62, .02], [.18, 3.25, .06], .21, .105, 7),
    branch([.11, 2.10, .02], [1.05, 2.92, .22], .095, .045, 5),
    branch([.15, 2.66, .03], [-.85, 3.36, -.25], .085, .040, 5),
    branch([.18, 3.22, .06], [.34, 3.72, .12], .080, .035, 5),
  ];
  for (const p of parts) tint(p, [1, 1, 1], { y0: 0, y1: 3.7, s0: .58, s1: 1.08, jit: .10, seed: 101 });
  return weld(parts);
}

/* 银杏：直干 + 根部两条小支根 */
function woodStraight() {
  const parts = [
    flareGeo(.36, .48, 6),
    branch([0, 0, 0], [.03, 3.05, .02], .23, .115, 7),
    branch([.02, .12, .06], [.30, .30, .16], .085, .040, 4),
    branch([.02, .12, -.06], [-.26, .28, -.18], .080, .040, 4),
  ];
  for (const p of parts) tint(p, [1, 1, 1], { y0: 0, y1: 3.1, s0: .60, s1: 1.06, jit: .09, seed: 202 });
  return weld(parts);
}

/* 柳：矮主干 + 三条拱形上扬枝（梢头正好接住树冠与垂枝） */
function woodWillow() {
  const parts = [
    flareGeo(.42, .52, 6),
    branch([0, 0, 0], [.09, 1.62, .02], .29, .20, 7),
    branch([.09, 1.50, .02], [.16, 2.45, .04], .20, .12, 6),
    branch([.10, 1.60, .02], [1.20, 3.86, .16], .120, .050, 5),
    branch([.10, 1.60, .02], [-1.04, 3.70, .40], .115, .050, 5),
    branch([.10, 1.60, .02], [.16, 3.96, -1.14], .110, .048, 5),
    branch([.55, 2.60, .06], [1.05, 3.20, .50], .060, .030, 4),
    branch([-.45, 2.50, .20], [-.95, 3.05, .62], .060, .030, 4),
  ];
  for (const p of parts) tint(p, [1, 1, 1], { y0: 0, y1: 4.0, s0: .58, s1: 1.05, jit: .10, seed: 303 });
  return weld(parts);
}

/* ── 叶片件 ───────────────────────────────────────────────────── */
/* 松：4 层压扁塔形针叶冠，层与层之间留缝（0.17~0.24m），顶上加尖 */
function pineFoliage() {
  const parts = [];
  const layers = [
    [1.72, 1.62, 1.34, 0.00, 0.00],
    [3.04, 1.30, 1.22, 0.13, -0.09],
    [4.28, 0.96, 1.06, -0.11, 0.12],
    [5.32, 0.56, 0.86, 0.06, 0.05],
  ];
  for (const [y, r, h, ox, oz] of layers) {
    const c = coneGeo(r, h, 7, .82);
    c.translate(ox, y, oz);
    parts.push(c);
  }
  const spike = coneGeo(.24, .46, 6, .90);
  spike.translate(.02, 5.86, .02);
  parts.push(spike);
  /* 侧边小团块，打破规整对称 */
  const s1 = ballGeo(.30, 6, 4, .62); s1.translate(.96, 2.08, .40); parts.push(s1);
  const s2 = ballGeo(.24, 6, 4, .60); s2.translate(-.84, 3.46, -.34); parts.push(s2);
  const s3 = ballGeo(.18, 6, 3, .60); s3.translate(.38, 4.66, -.48); parts.push(s3);
  for (const p of parts) tint(p, [.92, 1.00, .95], { y0: 1.7, y1: 6.1, s0: .62, s1: 1.12, jit: .09, seed: 404 });
  return weld(parts);
}

/* 榆：伞形冠，2~3 层不规则球（下缘参差、上部收拢） */
function elmFoliage() {
  const parts = [];
  const blobs = [
    [0.00, 3.95, 0.00, 1.45, 7, 4, .70],
    [0.95, 3.85, 0.45, 1.05, 6, 4, .72],
    [-0.88, 3.90, -0.62, 1.00, 6, 4, .72],
    [0.30, 3.72, 1.05, 0.92, 6, 4, .74],
    [-0.55, 3.78, -1.05, 0.86, 6, 4, .74],
    [0.18, 4.80, -0.12, 1.08, 7, 4, .62],
    [-0.75, 4.40, 0.55, 0.70, 6, 4, .66],
    [0.78, 4.34, 0.50, 0.64, 6, 4, .66],
    [0.05, 5.46, 0.05, 0.70, 6, 3, .68],
  ];
  for (const [x, y, z, r, s, ri, f] of blobs) {
    const b = ballGeo(r, s, ri, f);
    b.translate(x, y, z);
    parts.push(b);
  }
  for (const p of parts) tint(p, [1, 1, 1], { y0: 3.0, y1: 6.0, s0: .64, s1: 1.12, jit: .08, seed: 505 });
  return weld(parts);
}

/* 银杏：圆锥冠 + 两团侧球，秋天偏黄绿 */
function gingkoFoliage() {
  const parts = [];
  const cone = coneGeo(1.12, 2.10, 8, .90);
  cone.translate(0, 4.05, 0);
  parts.push(cone);
  const b1 = ballGeo(1.28, 7, 4, .78); b1.translate(0, 3.62, 0); parts.push(b1);
  const b2 = ballGeo(.82, 6, 4, .80); b2.translate(.52, 3.80, .42); parts.push(b2);
  const b3 = ballGeo(.60, 6, 4, .78); b3.translate(-.48, 4.35, -.40); parts.push(b3);
  for (const p of parts) tint(p, [1.06, 1.00, .70], { y0: 2.6, y1: 6.0, s0: .68, s1: 1.14, jit: .08, seed: 606 });
  return weld(parts);
}

/* 柳：顶部一小团冠 + 4 组共 8 条垂枝（下垂到地面附近） */
function willowFoliage() {
  const parts = [];
  const crown = [
    [0.00, 3.95, 0.00, 1.16, 7, 4, .84],
    [0.14, 5.02, -0.12, 0.90, 6, 4, .84],
    [0.78, 4.30, 0.52, 0.62, 6, 4, .82],
  ];
  for (const [x, y, z, r, s, ri, f] of crown) {
    const b = ballGeo(r, s, ri, f);
    b.translate(x, y, z);
    parts.push(b);
  }
  for (let gi = 0; gi < 5; gi++) {
    const a = gi * Math.PI * 2 / 5 + .42;
    for (let si = 0; si < 2; si++) {
      const r0 = .50 + si * .38;
      const pts = [
        [Math.cos(a) * r0, 3.98 - si * .18, Math.sin(a) * r0],
        [Math.cos(a) * (r0 + .30), 3.34 - si * .20, Math.sin(a) * (r0 + .30)],
        [Math.cos(a) * 1.06, 2.30 - si * .24, Math.sin(a) * 1.06],
        [Math.cos(a) * 1.02, 1.20 - si * .22, Math.sin(a) * 1.02],
        [Math.cos(a) * .96, .32 + si * .14, Math.sin(a) * .96],
      ];
      parts.push(tubeGeo(pts, .045, 4, 6));
    }
  }
  for (const p of parts) tint(p, [.96, 1.02, .94], { y0: .3, y1: 4.2, s0: .58, s1: 1.10, jit: .08, seed: 707 });
  return weld(parts);
}

/* 竹：一丛 7 根细竹竿（微弯、高低不一）+ 顶部竹叶簇 */
function bambooClump() {
  const parts = [], leaves = [];
  const rr = makeRng(808);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rr() * .8;
    const rad = .18 + rr() * .42;
    const bx = Math.cos(a) * rad, bz = Math.sin(a) * rad;
    const h = 5.0 + rr() * 1.4;
    const dx = (rr() - .5) * .5, dz = (rr() - .5) * .5;
    const pts = [
      [bx, -.06, bz],
      [bx + dx * .30, h * .35, bz + dz * .30],
      [bx + dx * .72, h * .72, bz + dz * .72],
      [bx + dx, h, bz + dz],
    ];
    const culm = tubeGeo(pts, .055, 4, 4);
    tint(culm, [1.18, 1.12, .55], { y0: 0, y1: h, s0: .68, s1: 1.14, jit: .06, seed: 900 + i });
    parts.push(culm);
    /* 每根竹竿顶上一小簇叶 */
    const c2 = ballGeo(.26, 6, 3, .74);
    c2.translate(bx + dx + (rr() - .5) * .4, h - .12, bz + dz + (rr() - .5) * .4);
    leaves.push(c2);
    if (i % 2 === 0) {
      const c3 = ballGeo(.20, 6, 3, .76);
      c3.translate(bx + dx + (rr() - .5) * .7, h - .42, bz + dz + (rr() - .5) * .7);
      leaves.push(c3);
    }
    /* 竹叶：细长下垂的一片，不用横板 */
    const blade = new THREE.BoxGeometry(.58, .012, .065);
    blade.rotateY(rr() * Math.PI * 2);
    blade.rotateZ((rr() < .5 ? -1 : 1) * (.85 + rr() * .45));
    blade.translate(bx + dx + (rr() - .5) * .25, h - .22, bz + dz + (rr() - .5) * .25);
    leaves.push(blade);
  }
  /* 叶簇（比竹竿更绿） */
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + .6;
    const c = ballGeo(.34, 6, 3, .72);
    c.translate(Math.cos(a) * .55, 5.6 + rr() * .6, Math.sin(a) * .55);
    leaves.push(c);
  }
  for (const p of leaves) tint(p, [.92, 1.08, .72], { y0: 3.6, y1: 6.4, s0: .70, s1: 1.14, jit: .08, seed: 950 + leaves.indexOf(p) });
  return weld(parts.concat(leaves));
}

/* ── 材质：全部从共享调色板派生 ───────────────────────────────── */
function cloneMat(base, hex) {
  const m = base.clone();
  m.vertexColors = true;
  if (hex !== undefined) m.color.setHex(hex);
  return m;
}

/* ── 入口 ─────────────────────────────────────────────────────── */
export function build(layout) {
  initMaterials();
  const rnd = makeRng((layout.seed | 0) ^ 0x22);

  const group = new THREE.Group();
  group.name = 'model-trees';

  /* 按 type 分组 */
  const byType = { pine: [], bamboo: [], willow: [], elm: [], gingko: [] };
  for (const t of (layout.trees || [])) {
    if (byType[t.type]) byType[t.type].push(t);
  }

  /* 每棵树的变换：位置 y=0（根部入地）、只绕 Y 旋转 rot */
  const plan = {};
  for (const key of TYPES) {
    const ft = FT[key];
    plan[key] = byType[key].map(t => {
      const groveBoost = t.grove ? 1.10 + rnd() * .15 : 1.0;   // 树丛里更高更密
      const wide = t.grove ? 1.05 + rnd() * .10 : .90 + rnd() * .18;
      const s = (t.scale ?? 1) * groveBoost * ft;
      return {
        pos: new THREE.Vector3(t.x, 0, t.z),
        quat: new THREE.Quaternion().setFromAxisAngle(UP, t.rot ?? 0),
        scl: new THREE.Vector3(s * wide, s, s * wide),
        shade: .90 + rnd() * .20,
      };
    });
  }

  const barkMat = cloneMat(MAT.bark, 0x9c7c58);
  const pineMat = cloneMat(MAT.leafPine, 0x4c7d52);
  const bambooMat = cloneMat(MAT.leafBamboo, 0xd6e08e);
  const leafMat = cloneMat(MAT.leaf, 0xb4e08c);
  const gingkoMat = cloneMat(MAT.leaf, 0xe6e650);

  const add = (geo, mat, list, name, tintArr) => {
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
      c.setRGB(p.shade * tintArr[0], p.shade * tintArr[1], p.shade * tintArr[2]);
      m.setColorAt(i, c);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    group.add(m);
    return m;
  };

  /* 木质件：松 + 榆合流，银杏直干，柳矮干 */
  add(woodForked(), barkMat, plan.pine.concat(plan.elm), 'trees-wood-forked', [1, 1, 1]);
  add(woodStraight(), barkMat, plan.gingko, 'trees-wood-straight', [1, 1, 1]);
  add(woodWillow(), barkMat, plan.willow, 'trees-wood-willow', [1, 1, 1]);
  /* 叶片件：每种树一个 InstancedMesh */
  add(pineFoliage(), pineMat, plan.pine, 'trees-pine', TINT.pine);
  add(bambooClump(), bambooMat, plan.bamboo, 'trees-bamboo', TINT.bamboo);
  add(willowFoliage(), leafMat, plan.willow, 'trees-willow', TINT.willow);
  add(elmFoliage(), leafMat, plan.elm, 'trees-elm', TINT.elm);
  add(gingkoFoliage(), gingkoMat, plan.gingko, 'trees-gingko', TINT.gingko);

  return group;
}
