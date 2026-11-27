/* 江南古村 · 村民模块（people.js）
   ------------------------------------------------------------------
   做法
   ① 每个人一个 Group，Group 里挂一副骨架（骨盆 / 上身 / 头 / 双肩双肘 /
      双胯双膝双踝），姿态由 userData.update(t,dt) 逐帧写进骨架节点，
      再把每个部件节点的 matrixWorld 塞进对应的 InstancedMesh。
      → 一个人 = 16 个 InstancedMesh 里各占一格，人人有独立动作。
   ② 几何只建一次：头 / 发 / 头巾 / 斗笠 / 躯干 / 腰带 / 上臂 / 前臂 /
      大腿 / 小腿 / 鞋 / 扁担 / 桶 / 锄头 / 独轮车，共 16 份 BufferGeometry，
      全村人共用（不是每人一整套）。
   ③ 布色用 instanceColor 分：短褐四色 —— 靛蓝 / 土黄 / 赭石 / 灰褐；
      裤子再暗一档，头巾 / 斗笠另给一色 —— 不会全身一个颜色。
   ④ 站位：优先路肩（离路面 0.4~1.0m，不挡道）→ 屋前土场 → 河边 2~5m
      → 桥头 / 晒谷架旁。落脚点按 layout 的格位掩码筛掉
      水 / 桥 / 田 / 房 / 塔 / 牌坊，再躲开树和道具。
      村子核心区地面严格 y=0（terrain.js 的平坦掩码），所以人脚底贴地。
   ⑤ 走路的人沿路来回走（步频跟位移同步），蹲着 / 站着的不动，
      手上动作（搓衣、挥手、说话）有小循环。
   随机数：makeRng(seed ^ 0x9E37)，固定次序消费，同 seed 必得同一张图。
   draw call：16（每个部件一个 InstancedMesh）；三角面 ≈ 4 万。
*/
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { MAT, initMaterials } from '../core/materials.js';
import { mergeGeometries } from '../core/geo.js';
import { TYPE, CORE } from '../core/layout.js';

/* ── 常量 ────────────────────────────────────────────────── */
const SEED_XOR = 0x9E37;         // 本模块自己的随机种子异或常数
const HIP_Y = 0.90;              // 胯高（脚底 y=0）
const SHOULDER_Y = 0.44;         // 肩离胯高
const UPPER_ARM = 0.28;          // 上臂长
const FORE_ARM = 0.26;           // 前臂长
const THIGH = 0.44;              // 大腿长
const SHIN = 0.38;               // 小腿长
const ANKLE_Y = HIP_Y - THIGH - SHIN;   // 踝高 0.08
const NECK_Y = 0.55;             // 脖子离胯高（躯干顶）
const STRIDE = 1.35;             // 一步迈多远（米），步频由位移同步
const ROAD_HALF = { main: 1.70, stone: 1.20, dirt: 0.85 };   // 与 roads.js 同宽

/* 人数与动作配额（合计 31） */
const QUOTA = [
  { action: 'water', n: 5 },    // 挑水
  { action: 'hoe', n: 4 },      // 扛锄头
  { action: 'cart', n: 4 },     // 推独轮车
  { action: 'idle', n: 8 },     // 门口闲站
  { action: 'wave', n: 2 },     // 挥手
  { action: 'wash', n: 4 },     // 河边洗东西
  { action: 'chat', n: 4 },     // 蹲着聊天（两对）
];

/* 布衣四色（短褐）：靛蓝 / 土黄 / 赭石 / 灰褐 */
const GARMENT = [0x2f4a70, 0xb08a46, 0x9c5b38, 0x7a6c58, 0x465a63];
const PANTS = [0x3b4250, 0x5a4a34, 0x453c33, 0x2e3440];
const SKIN = [0xe2b68e, 0xd3a276, 0xc79668, 0xdcab80];
const HAIRC = [0x1e1915, 0x2b2118, 0x181410];
const WRAPC = [0xd9d3c2, 0x2f4a70, 0xb8ac96, 0x8d8371];

/* 鞋的局部包围盒 8 个角（脚底贴地算最低点用） */
const SHOE_CORNERS = [
  -.055, -.077, -.062, .055, -.077, -.062, .055, -.077, .168, -.055, -.077, .168,
  -.055, .006, -.062, .055, .006, -.062, .055, .006, .168, -.055, .006, .168,
];
const _v = new THREE.Vector3();

/* ── 几何小工具 ───────────────────────────────────────────── */
function merge(parts) {
  return mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p)), false);
}
/* 顶点色：木料件里深浅不同（斧刃 / 轮辐 / 杆身） */
function paint(geo, rgb) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = rgb[0]; arr[i * 3 + 1] = rgb[1]; arr[i * 3 + 2] = rgb[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function boxG(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
/* 超椭圆环截面（圆角方），p 越大越方 */
function ringPts(hw, hd, p, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push([
      hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / p),
      hd * Math.sign(s) * Math.pow(Math.abs(s), 2 / p),
    ]);
  }
  return pts;
}
/* 放样：sections = [[y, 半宽, 半厚, 方圆度], ...]，原点 = 胯 */
function loftRings(sections, n = 16) {
  const pos = [], uv = [], idx = [];
  const rings = sections.map(s => ringPts(s[1], s[2], s[3] ?? 3.4, n));
  for (let j = 0; j < sections.length; j++) for (let i = 0; i < n; i++) {
    const q = rings[j][i];
    pos.push(q[0], sections[j][0], q[1]);
    uv.push((i / n) * 2, sections[j][0]);
  }
  for (let j = 0; j < sections.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i, b = j * n + (i + 1) % n, c = a + n, d = b + n;
    idx.push(a, c, b, b, c, d);
  }
  const cb = pos.length / 3;
  pos.push(0, sections[0][0], 0); uv.push(.5, 0);
  for (let i = 0; i < n; i++) idx.push(cb, i, (i + 1) % n);
  const top = sections.length - 1, base = top * n;
  const ct = pos.length / 3;
  pos.push(0, sections[top][0], 0); uv.push(.5, 1);
  for (let i = 0; i < n; i++) idx.push(ct, base + (i + 1) % n, base + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/* 两点之间的方料 */
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
  m.setPosition(a.clone().add(b).multiplyScalar(.5));
  g.applyMatrix4(m);
  return g;
}

/* ── 人体零件几何（各建一次，全村共用） ───────────────────── */
/* 头：略扁的颅骨 + 鼻子 + 脖子，原点 = 颈顶 */
function headGeo() {
  const parts = [];
  const skull = new THREE.SphereGeometry(.115, 14, 10);
  skull.scale(.95, 1.05, 1.0);
  skull.translate(0, .115, 0);
  parts.push(skull);
  const nose = new THREE.ConeGeometry(.022, .058, 6);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, .102, .104);
  parts.push(nose);
  const neck = new THREE.CylinderGeometry(.048, .058, .11, 8);
  neck.translate(0, .022, 0);
  parts.push(neck);
  return merge(parts);
}
/* 发：贴头的一顶短发 */
function hairGeo() {
  const g = new THREE.SphereGeometry(.124, 14, 8, 0, Math.PI * 2, 0, Math.PI * .56);
  g.translate(0, .115, 0);
  return g;
}
/* 发髻 */
function bunGeo() {
  const g = new THREE.SphereGeometry(.056, 10, 8);
  g.scale(1, .85, 1);
  g.translate(0, .09, -.112);
  return g;
}
/* 头巾：箍 + 盖住头顶的布 + 后脑的结 */
function wrapGeo() {
  const parts = [];
  const band = new THREE.CylinderGeometry(.127, .130, .155, 14);
  band.translate(0, .105, 0);
  parts.push(band);
  const crown = new THREE.SphereGeometry(.130, 14, 8, 0, Math.PI * 2, 0, Math.PI * .52);
  crown.translate(0, .113, 0);
  parts.push(crown);
  const knot = new THREE.SphereGeometry(.044, 8, 6);
  knot.scale(1, .8, 1.3);
  knot.translate(0, .095, -.128);
  parts.push(knot);
  return merge(parts);
}
/* 斗笠：锥面 + 檐圈 + 顶钮 */
function hatGeo() {
  const parts = [];
  const cone = new THREE.ConeGeometry(.335, .165, 16, 1, true);
  cone.translate(0, .152, 0);
  parts.push(cone);
  const rim = new THREE.TorusGeometry(.333, .013, 5, 18);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, .070, 0);
  parts.push(rim);
  const knob = new THREE.SphereGeometry(.032, 8, 6);
  knob.translate(0, .242, 0);
  parts.push(knob);
  return merge(parts);
}
/* 躯干：胯 → 腰 → 胸 → 肩线 → 领口（有肩线，不是方盒） */
function torsoGeo() {
  return loftRings([
    [.00, .170, .116, 3.2],
    [.11, .156, .102, 3.4],
    [.26, .178, .108, 3.6],
    [.41, .205, .113, 3.4],
    [.49, .200, .107, 3.3],
    [.55, .172, .096, 3.2],
  ], 16);
}
/* 腰带 */
function beltGeo() {
  const g = new THREE.TorusGeometry(.160, .024, 6, 18);
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, .64);
  g.translate(0, .115, 0);
  return g;
}
/* 上臂：肩头 + 袖筒，原点 = 肩，向下伸 */
function upperArmGeo() {
  const parts = [];
  const cap = new THREE.SphereGeometry(.058, 10, 8);
  parts.push(cap);
  const arm = new THREE.CylinderGeometry(.050, .062, UPPER_ARM, 10);
  arm.translate(0, -UPPER_ARM / 2, 0);
  parts.push(arm);
  return merge(parts);
}
/* 前臂 + 手：卷起袖子，小臂是肉色 */
function foreArmGeo() {
  const parts = [];
  const arm = new THREE.CylinderGeometry(.046, .038, FORE_ARM, 10);
  arm.translate(0, -FORE_ARM / 2, 0);
  parts.push(arm);
  const hand = new THREE.SphereGeometry(.049, 10, 8);
  hand.scale(1, .88, 1.28);
  hand.translate(0, -FORE_ARM - .015, .014);
  parts.push(hand);
  return merge(parts);
}
/* 大腿：裤管，原点 = 胯 */
function thighGeo() {
  const parts = [];
  const hip = new THREE.SphereGeometry(.080, 10, 8);
  hip.scale(1, .8, 1);
  parts.push(hip);
  const leg = new THREE.CylinderGeometry(.062, .078, THIGH, 10);
  leg.translate(0, -THIGH / 2, 0);
  parts.push(leg);
  return merge(parts);
}
/* 小腿，原点 = 膝 */
function shinGeo() {
  const g = new THREE.CylinderGeometry(.046, .060, SHIN, 10);
  g.translate(0, -SHIN / 2, 0);
  return g;
}
/* 布鞋：鞋底 + 鞋面 + 鞋头，原点 = 踝 */
function shoeGeo() {
  const parts = [];
  const sole = new THREE.BoxGeometry(.106, .030, .245);
  sole.translate(0, -.062, .034);
  parts.push(sole);
  const upper = new THREE.BoxGeometry(.096, .062, .138);
  upper.translate(0, -.019, .004);
  parts.push(upper);
  const toe = new THREE.SphereGeometry(.050, 8, 6);
  toe.scale(1, .68, 1);
  toe.translate(0, -.034, .106);
  parts.push(toe);
  return merge(parts);
}
/* 扁担：横杆，原点 = 杆心 */
function poleGeo() {
  const parts = [];
  const bar = new THREE.CylinderGeometry(.027, .027, 1.84, 8);
  bar.rotateZ(Math.PI / 2);
  parts.push(paint(bar, [.62, .45, .30]));
  for (const sx of [-1, 1]) {
    const cap = new THREE.SphereGeometry(.034, 8, 6);
    cap.scale(1.5, .8, .8);
    cap.translate(sx * .90, 0, 0);
    parts.push(paint(cap, [.50, .36, .24]));
  }
  return merge(parts);
}
/* 桶 / 竹篓：原点在提梁顶端（挂点），桶身往下 */
function bucketGeo() {
  const parts = [];
  const body = new THREE.CylinderGeometry(.152, .112, .275, 12);
  body.translate(0, -.138, 0);
  parts.push(body);
  const rim = new THREE.TorusGeometry(.152, .016, 5, 14);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, -.004, 0);
  parts.push(rim);
  const handle = new THREE.CylinderGeometry(.013, .013, .135, 6);
  handle.translate(0, -.062, 0);
  parts.push(handle);
  return merge(parts);
}
/* 锄头：扛在右肩上，刃朝前下方。原点 = 脚下地面 */
function hoeGeo() {
  const A = [-.30, 1.26, .34];          // 刃端（前上方）
  const B = [-.17, 1.00, -.56];         // 握把端（后下方，贴着背）
  const parts = [];
  const shaft = barG(A, B, .034, .034);
  parts.push(paint(shaft, [.58, .42, .27]));
  const blade = boxG(.135, .125, .026);
  blade.rotateY(.22);
  blade.rotateX(-.35);
  blade.translate(A[0] - .015, A[1] - .03, A[2] + .05);
  parts.push(paint(blade, [.28, .29, .29]));
  const collar = boxG(.048, .048, .14);
  collar.rotateX(-.62);
  collar.translate(A[0] - .008, A[1] - .08, A[2] - .04);
  parts.push(paint(collar, [.42, .31, .21]));
  return merge(parts);
}
/* 独轮车：轮 + 辐 + 斗 + 车把 + 支腿，原点 = 推车人脚下 */
function cartGeo() {
  const parts = [];
  const wy = .305, wz = 1.36;
  const tire = new THREE.TorusGeometry(.255, .052, 6, 16);
  tire.translate(0, wy, wz);
  parts.push(paint(tire, [.22, .20, .19]));
  const rim = new THREE.TorusGeometry(.215, .022, 5, 16);
  rim.translate(0, wy, wz);
  parts.push(paint(rim, [.52, .38, .25]));
  const hub = new THREE.CylinderGeometry(.048, .048, .12, 8);
  hub.rotateX(Math.PI / 2);
  hub.translate(0, wy, wz);
  parts.push(paint(hub, [.40, .29, .19]));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(paint(barG([0, wy, wz], [Math.cos(a) * .215, wy + Math.sin(a) * .215, wz], .028, .028),
      [.48, .35, .23]));
  }
  /* 斗：底 + 两侧板 + 前板 */
  parts.push(paint(boxG(.56, .05, .72, 0, .555, 1.14), [.55, .40, .26]));
  parts.push(paint(boxG(.05, .235, .72, -.295, .67, 1.14), [.50, .36, .24]));
  parts.push(paint(boxG(.05, .235, .72, .295, .67, 1.14), [.50, .36, .24]));
  parts.push(paint(boxG(.60, .235, .05, 0, .67, 1.48), [.46, .33, .22]));
  parts.push(paint(boxG(.60, .05, .05, 0, .775, .79), [.52, .38, .25]));
  /* 车把：往后伸到推车人手里 */
  for (const sx of [-1, 1]) {
    parts.push(paint(barG([sx * .245, .72, .84], [sx * .205, .965, .45], .034, .034), [.55, .40, .26]));
    parts.push(paint(boxG(.045, .42, .045, sx * .20, .21, .82), [.40, .29, .19]));
  }
  return merge(parts);
}

/* ── 骨架 ─────────────────────────────────────────────────── */
/* 节点名约定：sh[0]=左臂(+x) sh[1]=右臂(-x)；正面朝 +z */
function makeRig() {
  const G = () => new THREE.Group();
  const root = G();
  const pelvis = G(); pelvis.position.y = HIP_Y; root.add(pelvis);
  const torso = G(); pelvis.add(torso);
  const neck = G(); neck.position.y = NECK_Y; torso.add(neck);
  const sh = [G(), G()], el = [G(), G()], hip = [G(), G()], knee = [G(), G()], ankle = [G(), G()];
  sh[0].position.set(.19, SHOULDER_Y, 0);
  sh[1].position.set(-.19, SHOULDER_Y, 0);
  for (let i = 0; i < 2; i++) {
    torso.add(sh[i]);
    el[i].position.y = -UPPER_ARM; sh[i].add(el[i]);
    hip[i].position.set(i === 0 ? .105 : -.105, 0, 0);
    pelvis.add(hip[i]);
    knee[i].position.y = -THIGH; hip[i].add(knee[i]);
    ankle[i].position.y = -SHIN; knee[i].add(ankle[i]);
  }
  return { root, pelvis, torso, neck, sh, el, hip, knee, ankle };
}

/* ── 姿态 ─────────────────────────────────────────────────── */
/* 走路：腿前后摆 + 手臂反摆 + 骨盆起伏（步频由位移同步） */
function walkPose(r, ph, ampLeg, ampArm, lean) {
  const s = Math.sin(ph), c = Math.cos(ph);
  r.hip[0].rotation.x = -ampLeg * s;
  r.hip[1].rotation.x = ampLeg * s;
  r.knee[0].rotation.x = .14 + .88 * Math.max(0, Math.sin(ph - .75));
  r.knee[1].rotation.x = .14 + .88 * Math.max(0, Math.sin(ph + Math.PI - .75));
  r.ankle[0].rotation.x = -(r.hip[0].rotation.x + r.knee[0].rotation.x) * .55;
  r.ankle[1].rotation.x = -(r.hip[1].rotation.x + r.knee[1].rotation.x) * .55;
  r.sh[0].rotation.x = ampArm * s;
  r.sh[1].rotation.x = -ampArm * s;
  r.el[0].rotation.x = .26 + .22 * Math.max(0, -s);
  r.el[1].rotation.x = .26 + .22 * Math.max(0, s);
  r.pelvis.position.y = HIP_Y + .022 * Math.cos(ph * 2);
  r.pelvis.rotation.z = .028 * s;
  r.torso.rotation.y = -.05 * s;
  r.torso.rotation.x = lean;
}
/* 蹲：胯下沉 + 大腿前伸 + 小腿折回 */
function crouchPose(r, depth) {
  r.pelvis.position.y = HIP_Y - depth;
  r.hip[0].rotation.x = -1.20; r.hip[1].rotation.x = -1.20;
  r.knee[0].rotation.x = 2.00; r.knee[1].rotation.x = 2.00;
  r.ankle[0].rotation.x = -.42; r.ankle[1].rotation.x = -.42;
  r.torso.rotation.x = .34;
  r.torso.rotation.y = 0;
  r.sh[0].rotation.x = -.80; r.sh[1].rotation.x = -.80;
  r.el[0].rotation.x = -.50; r.el[1].rotation.x = -.50;
}

/* ── 落脚点 ───────────────────────────────────────────────── */
function makeFinder(layout) {
  const ox = layout.originX, oz = layout.originZ;
  const cell = layout.cell || 3.2;
  const W = layout.W, H = layout.H;

  /* 铺装矩形（与 roads.js 同宽 + 端头外延） */
  const roadRects = (layout.roads || []).map(r => {
    const half = ROAD_HALF[r.kind] || 1.0;
    const horiz = Math.abs(r.z2 - r.z1) < Math.abs(r.x2 - r.x1);
    return horiz
      ? { x0: Math.min(r.x1, r.x2) - .3, x1: Math.max(r.x1, r.x2) + .3, z0: r.z1 - half, z1: r.z1 + half }
      : { x0: r.x1 - half, x1: r.x1 + half, z0: Math.min(r.z1, r.z2) - .3, z1: Math.max(r.z1, r.z2) + .3 };
  });
  /* 河道带 */
  const waterRects = (layout.rivers || []).map(r => {
    const horiz = Math.abs(r.z2 - r.z1) < Math.abs(r.x2 - r.x1);
    return horiz
      ? { x0: Math.min(r.x1, r.x2), x1: Math.max(r.x1, r.x2), z0: r.z1 - r.w / 2, z1: r.z1 + r.w / 2 }
      : { x0: r.x1 - r.w / 2, x1: r.x1 + r.w / 2, z0: Math.min(r.z1, r.z2), z1: Math.max(r.z1, r.z2) };
  });
  const rectDist = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

  const trees = layout.trees || [];
  const props = layout.props || [];

  /* 能不能站：不在水里 / 田里 / 房里 / 塔牌坊下，不贴着树和道具 */
  function ok(x, z, onRoad) {
    const gx = Math.floor((x - ox) / cell), gz = Math.floor((z - oz) / cell);
    if (gx < CORE + 1 || gx > W - CORE - 2 || gz < CORE + 1 || gz > H - CORE - 2) return false;
    const t = layout.cellType(gx, gz);
    if (t & (TYPE.WATER | TYPE.BRIDGE | TYPE.FIELD | TYPE.HOUSE | TYPE.TOWER | TYPE.PAIFANG)) return false;
    if (!onRoad) {
      for (const r of roadRects) if (rectDist(r, x, z) < .12) return false;   // 不站路面上
    }
    for (const r of waterRects) if (rectDist(r, x, z) < .6) return false;      // 不站水边沿
    for (const tr of trees) { if (Math.abs(tr.x - x) < 1.7 && Math.abs(tr.z - z) < 1.7) return false; }
    for (const p of props) { if (Math.abs(p.x - x) < 1.0 && Math.abs(p.z - z) < 1.0) return false; }
    return true;
  }
  return { ok, cell, ox, oz, W, H };
}

/* ── 主入口 ───────────────────────────────────────────────── */
export function build(layout) {
  initMaterials();
  const sd = (typeof layout.seed === 'number' ? layout.seed : parseInt(String(layout.seed), 10) || 0) | 0;
  const rng = makeRng(sd ^ SEED_XOR);
  const find = makeFinder(layout);

  const group = new THREE.Group();
  group.name = 'model-people';

  /* ── 材质：全部从 MAT 克隆，贴图不重新生成 ─────────────── */
  const matCloth = MAT.wall.clone();          // 短褐 / 裤子
  matCloth.color.setHex(0xffffff);
  const matSkin = MAT.wall.clone();           // 脸 / 手
  matSkin.color.setHex(0xffffff);
  matSkin.bumpScale = .006;
  const matDark = MAT.woodDark.clone();       // 鞋 / 发
  matDark.color.setHex(0xffffff);
  const matWood = MAT.wood.clone();           // 扁担 / 锄头 / 独轮车
  matWood.color.setHex(0xffffff);
  matWood.vertexColors = true;
  const matBamboo = MAT.bark.clone();         // 桶 / 竹篓
  matBamboo.color.setHex(0xffffff);
  const matHat = MAT.thatch.clone();          // 斗笠
  matHat.color.setHex(0xffffff);
  matHat.side = THREE.DoubleSide;

  /* ── 几何：每种只建一份 ─────────────────────────────────── */
  const GEO = {
    head: headGeo(), hair: hairGeo(), bun: bunGeo(), wrap: wrapGeo(), hat: hatGeo(),
    torso: torsoGeo(), belt: beltGeo(), upperArm: upperArmGeo(), foreArm: foreArmGeo(),
    thigh: thighGeo(), shin: shinGeo(), shoe: shoeGeo(),
    pole: poleGeo(), bucket: bucketGeo(), hoe: hoeGeo(), cart: cartGeo(),
  };
  const MAT_OF = {
    head: matSkin, hair: matDark, bun: matDark, wrap: matCloth, hat: matHat,
    torso: matCloth, belt: matDark, upperArm: matCloth, foreArm: matSkin,
    thigh: matCloth, shin: matCloth, shoe: matDark,
    pole: matWood, bucket: matBamboo, hoe: matWood, cart: matWood,
  };

  /* ── 人物 ───────────────────────────────────────────────── */
  const people = [];
  const placed = [];                          // 已占的落脚点（避免叠人）

  const used = (x, z, minD) => {
    for (const p of placed) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < minD) return true;
    }
    return false;
  };
  const pushSpot = (x, z, minD) => { placed.push({ x, z }); };

  /* 造一个人：骨架 + 部件登记 */
  function makePerson(action, x, z, yaw, opt = {}) {
    const rig = makeRig();
    const person = {
      action, rig, parts: [],
      yaw, x, z,
      scale: opt.scale ?? (0.95 + rng() * .075),
      phase: rng() * Math.PI * 2,
      speed: opt.speed ?? 1.0,
      s: opt.s ?? 0, dir: opt.dir ?? 1, len: opt.len ?? 0,
      px: 0, pz: 0,                        // 走路用的路径方向
      ph: rng() * Math.PI * 2,
    };
    const g = rig.root;
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    g.scale.setScalar(person.scale);
    group.add(g);
    people.push(person);

    const cloth = GARMENT[rng.int(0, GARMENT.length - 1)];
    const pant = PANTS[rng.int(0, PANTS.length - 1)];
    const skin = SKIN[rng.int(0, SKIN.length - 1)];
    const hair = HAIRC[rng.int(0, HAIRC.length - 1)];
    const wrapc = WRAPC[rng.int(0, WRAPC.length - 1)];
    person.cloth = cloth; person.pant = pant;

    const add = (key, node, color) => {
      /* 只是个"挂点"：真正画出来的是 InstancedMesh，
         这里用 Object3D 顶替 Mesh，避免每人十几个 mesh 白吃 draw call。 */
      const m = new THREE.Object3D();
      node.add(m);
      person.parts.push({ key, node: m, color });
    };
    const col = (hex) => new THREE.Color().setHex(hex);

    /* 躯干 + 腰带 */
    add('torso', rig.torso, col(cloth));
    add('belt', rig.torso, col(0x2a211a));
    /* 头 + 头发/头巾/斗笠 */
    add('head', rig.neck, col(skin));
    const hw = rng();
    if (hw < .42) {                                  // 短发
      add('hair', rig.neck, col(hair));
      if (rng.chance(.45)) add('bun', rig.neck, col(hair));
    } else if (hw < .74) {                           // 头巾
      add('wrap', rig.neck, col(wrapc));
    } else {                                         // 斗笠
      add('hat', rig.neck, col(0xc7b077));
    }
    /* 四肢 */
    for (let i = 0; i < 2; i++) {
      add('upperArm', rig.sh[i], col(cloth));
      add('foreArm', rig.el[i], col(skin));
      add('thigh', rig.hip[i], col(pant));
      add('shin', rig.knee[i], col(pant));
      add('shoe', rig.ankle[i], col(0x33251c));
    }
    /* 手上的家伙 */
    if (action === 'water') {
      const pole = new THREE.Group();
      pole.position.set(-.10, 1.30, 0);
      pole.rotation.z = -.09;
      g.add(pole);
      const pm = new THREE.Object3D();
      pole.add(pm);
      person.parts.push({ key: 'pole', node: pm, color: col(0xffffff) });
      for (const sx of [-1, 1]) {
        const b = new THREE.Object3D();
        b.position.set(sx * .90, -.035, 0);
        pole.add(b);
        person.parts.push({ key: 'bucket', node: b, color: col(rng.chance(.5) ? 0xb9ab6d : 0x8a6a42) });
      }
    } else if (action === 'hoe') {
      const hm = new THREE.Object3D();
      g.add(hm);
      person.parts.push({ key: 'hoe', node: hm, color: col(0xffffff) });
    } else if (action === 'cart') {
      const cm = new THREE.Object3D();
      g.add(cm);
      person.parts.push({ key: 'cart', node: cm, color: col(0xffffff) });
    } else if (action === 'wash') {
      const b = new THREE.Object3D();
      b.position.set(.46, .275, .28);
      g.add(b);
      person.parts.push({ key: 'bucket', node: b, color: col(0xb9ab6d) });
    }
    return person;
  }

  /* 走路的路：挑一段没有桥、没有房的直路 */
  function walkRoute(rng2, kinds, usedRoutes) {
    const pool = (layout.roads || []).filter(r => kinds.includes(r.kind));
    if (!pool.length) return null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const r = rng2.pick(pool);
      const horiz = Math.abs(r.z2 - r.z1) < Math.abs(r.x2 - r.x1);
      const len = horiz ? Math.abs(r.x2 - r.x1) : Math.abs(r.z2 - r.z1);
      if (len < 9) continue;
      const half = ROAD_HALF[r.kind] || 1.0;
      const side = rng2.chance(.5) ? 1 : -1;
      const lat = side * half * rng2.range(.30, .62);
      /* 采样检查：沿路找一段连续能走的（不压水 / 桥 / 田 / 房） */
      const dx = horiz ? Math.sign(r.x2 - r.x1) : 0;
      const dz = horiz ? 0 : Math.sign(r.z2 - r.z1);
      const px = horiz ? r.x1 : r.x1 + lat;
      const pz = horiz ? r.z1 + lat : r.z1;
      const STEP = 1.2;
      let best = null, cur = null;
      for (let t = 1.0; t <= len - 1.0; t += STEP) {
        const x = px + dx * t, z = pz + dz * t;
        const gx = Math.floor((x - find.ox) / find.cell), gz = Math.floor((z - find.oz) / find.cell);
        const tt = layout.cellType(gx, gz);
        if (tt & (TYPE.WATER | TYPE.BRIDGE | TYPE.FIELD | TYPE.HOUSE)) { cur = null; continue; }
        if (!cur) cur = { a: t, b: t };
        else cur.b = t;
        if (!best || (cur.b - cur.a) > (best.b - best.a)) best = { a: cur.a, b: cur.b };
      }
      if (!best || (best.b - best.a) < 6) continue;
      const a2 = best.a + .8, b2 = best.b - .8;
      if (b2 - a2 < 5) continue;
      /* 两条路别挨太近，免得两个人影叠在一起 */
      const rx = px + dx * (a2 + b2) / 2, rz = pz + dz * (a2 + b2) / 2;
      if (usedRoutes.some(u => Math.hypot(u.x - rx, u.z - rz) < 12)) continue;
      usedRoutes.push({ x: rx, z: rz });
      return {
        x0: px + dx * a2, z0: pz + dz * a2,
        dx, dz, len: b2 - a2,
        yaw: Math.atan2(dx, dz),
        x1: px + dx * b2, z1: pz + dz * b2,
      };
    }
    return null;
  }

  /* 屋前土场：正前 / 侧边，取离屋 3.8~5.8m 的空地 */
  function houseSpot(rng2) {
    const houses = (layout.houses || []);
    if (!houses.length) return null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const h = rng2.pick(houses);
      const D = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
      const d = D[h.door] || [0, 1];
      const mode = rng2.chance(.55) ? 0 : (rng2.chance(.5) ? 1 : 2);
      let dx = d[0], dz = d[1];
      if (mode === 1) { dx = -dz; dz = d[0]; }
      if (mode === 2) { dx = dz; dz = -d[0]; }
      const dist = rng2.range(3.9, 5.8);
      const lat = rng2.range(-1.5, 1.5);
      const x = h.x + dx * dist - dz * lat;
      const z = h.z + dz * dist + dx * lat;
      if (!find.ok(x, z, false)) continue;
      if (used(x, z, 1.5)) continue;
      /* 面向街面（背对屋子） */
      const yaw = Math.atan2(dx, dz);
      return { x, z, yaw, house: h };
    }
    return null;
  }

  /* 河边：离水边 2~4.6m */
  function riverSpot(rng2) {
    const rivers = (layout.rivers || []);
    if (!rivers.length) return null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = rng2.pick(rivers);
      const horiz = Math.abs(r.z2 - r.z1) < Math.abs(r.x2 - r.x1);
      const along = horiz ? rng2.range(-118, 118) : rng2.range(-118, 118);
      const side = rng2.chance(.5) ? 1 : -1;
      const off = r.w / 2 + rng2.range(2.0, 4.6);
      const x = horiz ? along : r.x1 + side * off;
      const z = horiz ? r.z1 + side * off : along;
      if (!find.ok(x, z, false)) continue;
      if (used(x, z, 1.6)) continue;
      /* 面向水 */
      const yaw = Math.atan2(horiz ? 0 : -side, horiz ? -side : 0);
      return { x, z, yaw };
    }
    return null;
  }

  /* 桥头 / 晒谷架旁 */
  function yardSpot(rng2) {
    const props = (layout.props || []).filter(p => p.kind === 'dryingrack' || p.kind === 'well' || p.kind === 'jar');
    for (let attempt = 0; attempt < 40; attempt++) {
      let bx, bz, ang;
      if (props.length && rng2.chance(.7)) {
        const p = rng2.pick(props);
        bx = p.x; bz = p.z; ang = rng2.range(0, Math.PI * 2);
      } else {
        const br = (layout.bridges || [])[rng2.int(0, Math.max(0, (layout.bridges || []).length - 1))];
        if (!br) return null;
        bx = layout.gx2w(br.gx); bz = layout.gz2w(br.gz);
        ang = rng2.range(0, Math.PI * 2);
      }
      const dist = rng2.range(1.8, 3.2);
      const x = bx + Math.cos(ang) * dist, z = bz + Math.sin(ang) * dist;
      if (!find.ok(x, z, false)) continue;
      if (used(x, z, 1.5)) continue;
      const yaw = Math.atan2(bx - x, bz - z);
      return { x, z, yaw };
    }
    return null;
  }

  /* ── 摆人 ───────────────────────────────────────────────── */
  const counts = {};
  const usedRoutes = [];
  const ROUTE_KIND = { water: ['main', 'stone', 'dirt'], hoe: ['main', 'stone', 'dirt'], cart: ['main', 'stone'] };

  for (const q of QUOTA) {
    counts[q.action] = 0;
    for (let i = 0; i < q.n; i++) {
      let p = null;
      if (q.action === 'water' || q.action === 'hoe' || q.action === 'cart') {
        const route = walkRoute(rng, ROUTE_KIND[q.action], usedRoutes);
        if (!route) continue;
        const speed = q.action === 'hoe' ? .62 : (q.action === 'cart' ? .82 : .70);
        const s0 = rng() * route.len;
        const x = route.x0 + route.dx * s0, z = route.z0 + route.dz * s0;
        const per = makePerson(q.action, x, z, route.yaw, { speed, s: s0, dir: 1, len: route.len });
        per.px = route.dx; per.pz = route.dz;
        per.route = route;
        per.yaw = route.yaw;
        pushSpot(x, z, 2.0);
      } else if (q.action === 'idle' || q.action === 'wave') {
        p = houseSpot(rng) || yardSpot(rng);
        if (!p) continue;
        makePerson(q.action, p.x, p.z, p.yaw);
        pushSpot(p.x, p.z, 1.5);
      } else if (q.action === 'wash') {
        p = riverSpot(rng);
        if (!p) continue;
        makePerson(q.action, p.x, p.z, p.yaw);
        pushSpot(p.x, p.z, 1.6);
      } else if (q.action === 'chat') {
        /* 成对：两人相距 1.5m，面对面蹲着 */
        if (i % 2 !== 0) continue;
        p = houseSpot(rng) || yardSpot(rng) || riverSpot(rng);
        if (!p) continue;
        const yaw = p.yaw;
        let bx = Math.sin(yaw + Math.PI / 2), bz = Math.cos(yaw + Math.PI / 2);
        let q2x = p.x + bx * 1.5, q2z = p.z + bz * 1.5;
        if (!find.ok(q2x, q2z, false)) {          // 对面那位没地方站 → 换一边
          bx = -bx; bz = -bz;
          q2x = p.x + bx * 1.5; q2z = p.z + bz * 1.5;
          if (!find.ok(q2x, q2z, false)) continue;
        }
        /* 两人面对面：甲看着乙，乙看着甲 */
        makePerson(q.action, p.x, p.z, Math.atan2(bx, bz));
        makePerson(q.action, q2x, q2z, Math.atan2(-bx, -bz));
        pushSpot(p.x, p.z, .1);
        pushSpot(q2x, q2z, .1);
        counts[q.action] += 2;
        continue;
      }
      counts[q.action]++;
    }
  }

  /* ── 建 InstancedMesh：每个部件一个 ─────────────────────── */
  const buckets = {};
  for (const per of people) for (const pt of per.parts) (buckets[pt.key] ||= []).push(pt);

  const meshes = {};
  for (const key of Object.keys(buckets)) {
    const list = buckets[key];
    const m = new THREE.InstancedMesh(GEO[key], MAT_OF[key], list.length);
    m.name = 'people-' + key;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;                 // 人会走动，包围盒会过期
    const c = new THREE.Color();
    for (let i = 0; i < list.length; i++) {
      list[i].index = i;
      c.copy(list[i].color);
      m.setColorAt(i, c);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    meshes[key] = m;
    group.add(m);
  }

  /* ── 逐帧更新 ───────────────────────────────────────────── */
  function angleLerp(a, b, k) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * k;
  }

  function poseOf(per, t, dt) {
    const r = per.rig;
    const ph = per.ph;
    switch (per.action) {
      case 'water': {
        walkPose(r, ph, .34, .24, .06);
        /* 右手扶担 */
        r.sh[1].rotation.x = -.58;
        r.sh[1].rotation.z = -.10;
        r.el[1].rotation.x = -.95;
        r.el[0].rotation.x = .22 + .18 * Math.max(0, -Math.sin(ph));
        break;
      }
      case 'hoe': {
        walkPose(r, ph, .30, .22, .05);
        /* 右肩扛锄 */
        r.sh[1].rotation.x = -.48;
        r.sh[1].rotation.z = -.14;
        r.el[1].rotation.x = -1.05;
        r.el[0].rotation.x = .22 + .18 * Math.max(0, -Math.sin(ph));
        break;
      }
      case 'cart': {
        walkPose(r, ph, .30, 0, .20);
        /* 双手推车把 */
        r.sh[0].rotation.x = -.76; r.sh[1].rotation.x = -.76;
        r.sh[0].rotation.z = .10; r.sh[1].rotation.z = -.10;
        r.el[0].rotation.x = -.34; r.el[1].rotation.x = -.34;
        break;
      }
      case 'idle': {
        const b = Math.sin(t * .9 + per.phase);
        r.pelvis.position.y = HIP_Y;
        r.hip[0].rotation.x = .03 + .02 * b; r.hip[1].rotation.x = -.04;
        r.knee[0].rotation.x = .06; r.knee[1].rotation.x = .10;
        r.sh[0].rotation.x = .07 + .05 * b; r.sh[1].rotation.x = -.06 + .04 * b;
        r.el[0].rotation.x = .20 + .07 * b; r.el[1].rotation.x = .24;
        r.torso.rotation.y = .09 * Math.sin(t * .33 + per.phase);
        r.torso.rotation.x = .02;
        r.neck.rotation.y = .30 * Math.sin(t * .47 + per.phase * 1.7);
        break;
      }
      case 'wave': {
        const b = Math.sin(t * .9 + per.phase);
        r.pelvis.position.y = HIP_Y;
        r.hip[0].rotation.x = .02; r.hip[1].rotation.x = -.03;
        r.sh[0].rotation.x = .05; r.el[0].rotation.x = .22;
        /* 右臂举起挥动（斜向前上方，别从斗笠后面冒出来） */
        r.sh[1].rotation.x = -1.95 + .06 * b;
        r.sh[1].rotation.z = -.22;
        r.el[1].rotation.x = -.45 + .12 * Math.sin(t * 4.6 + per.phase);
        r.el[1].rotation.z = .40 * Math.sin(t * 4.6 + per.phase);
        r.torso.rotation.y = .06 * Math.sin(t * .6 + per.phase);
        r.neck.rotation.y = -.14;
        break;
      }
      case 'wash': {
        crouchPose(r, .40);
        /* 双手伸到身前搓洗 */
        r.sh[0].rotation.x = -.95; r.sh[1].rotation.x = -.95;
        r.el[0].rotation.x = -.42; r.el[1].rotation.x = -.42;
        r.el[0].rotation.z = .12 * Math.sin(t * 3.4 + per.phase);
        r.el[1].rotation.z = -.12 * Math.sin(t * 3.4 + per.phase);
        r.neck.rotation.x = .22;
        break;
      }
      case 'chat': {
        crouchPose(r, .34);
        /* 一只手比划 */
        r.sh[0].rotation.x = -.88; r.el[0].rotation.x = -.55;
        r.sh[1].rotation.x = -.55;
        r.el[1].rotation.x = -.85 + .28 * Math.sin(t * 1.7 + per.phase);
        r.neck.rotation.x = .16;
        break;
      }
      default: break;
    }
  }

  for (const per of people) {
    per.update = (t, dt) => {
      const r = per.rig;
      r.root.position.y = 0;
      /* 走路的人沿路来回走：位移推进 → 步频同步 */
      if (per.len > 0) {
        per.s += per.speed * dt * per.dir;
        if (per.s > per.len) { per.s = per.len; per.dir = -1; }
        if (per.s < 0) { per.s = 0; per.dir = 1; }
        const x = per.route.x0 + per.px * per.s;
        const z = per.route.z0 + per.pz * per.s;
        r.root.position.set(x, 0, z);
        const target = Math.atan2(per.px * per.dir, per.pz * per.dir);
        per.yaw = angleLerp(per.yaw, target, 1 - Math.exp(-5 * Math.min(dt, .05)));
        r.root.rotation.y = per.yaw;
        per.ph += (per.speed * dt / STRIDE) * Math.PI * 2;
      }
      poseOf(per, t, dt);
      r.root.updateMatrixWorld(true);
      /* 脚底贴地：取两只鞋的最低点，把整个人抬 / 压到刚好落地
         （走路摆腿时脚会离地，整体跟着落，人才不悬空也不陷进土里） */
      let low = Infinity;
      for (const pt of per.parts) {
        if (pt.key !== 'shoe') continue;
        const m4 = pt.node.matrixWorld;
        for (let c = 0; c < SHOE_CORNERS.length; c += 3) {
          const v = _v.set(SHOE_CORNERS[c], SHOE_CORNERS[c + 1], SHOE_CORNERS[c + 2]).applyMatrix4(m4);
          if (v.y < low) low = v.y;
        }
      }
      if (isFinite(low)) {
        const shift = Math.max(-.14, Math.min(.14, -low));
        if (Math.abs(shift) > 1e-4) {
          r.root.position.y += shift;
          r.root.updateMatrixWorld(true);
        }
      }
      for (const pt of per.parts) {
        const m = meshes[pt.key];
        m.setMatrixAt(pt.index, pt.node.matrixWorld);
        m.instanceMatrix.needsUpdate = true;
      }
    };
    per.group = per.rig.root;
    per.group.userData.update = per.update;
    per.group.userData.person = {
      action: per.action, x: per.x, z: per.z,
      cloth: '#' + per.cloth.toString(16).padStart(6, '0'),
      parts: per.parts.map(x => ({ key: x.key, index: x.index })),
    };
    per.update(0, 0);
  }

  group.userData.people = {
    count: people.length,
    actions: counts,
    drawCalls: Object.keys(buckets).length,
  };
  return group;
}
