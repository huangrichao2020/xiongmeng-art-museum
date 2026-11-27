/* 江南古村 · 宝塔（七级方塔）
   ------------------------------------------------------------------
   形制：须弥座（圭角—束腰—上枋—台面）+ 七层楼阁式塔身 + 塔刹（覆钵—相轮—宝珠）
   尺度：台地顶面高 0.30m，须弥座高 1.50m（塔身起脚面 = 1.80m），
         砖墙层高 2.60m，每层节奏 3.05m
         塔身顶 = 1.80 + 7×3.05 = 23.15m ；塔刹顶 ≈ 25.9m
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
import { meshOf, paramSurface, mergeGeometries, nonIndexed } from '../core/geo.js';
import { MAT, initMaterials } from '../core/materials.js';
import { makeRng } from '../core/rng.js';
import { aoPatch, aoBatch } from '../core/ao.js';

/* ── 尺寸常量 ─────────────────────────────────────────────── */
const LEVELS = 7;
const W0 = 7.0;            // 一层墙身外边长
const SHRINK = 0.92;       // 每层收进 8%
const WALL_H = 2.60;       // 砖墙层高
const TH = 0.42;           // 墙厚
const PITCH = 3.05;        // 每层总节奏（墙 + 檐 + 平座）
const PED_H = 1.50;        // 须弥座自身总高
const PLAT_SIZE = 17;      // 塔前石台地边长
const PLAT_H = 0.30;       // 台地顶面比地面高 30cm（做"台基"：不然山把台基埋掉一半，
                           //  接地阴影也就没地方落；台地有了，塔也不是硬边坐在坡上）
const BASE_Y = PLAT_H + PED_H;   // 塔身起脚面 = 1.80
const EAVE_OUT = 1.75;     // 瓦面外挑
const BALC_OUT = 0.80;     // 平座外挑
const UPTURN = 0.45;       // 檐角起翘

/* ── 几何小工具 ───────────────────────────────────────────── */
function boxG(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/* 平面投影 UV：按顶点法线挑投影面，贴图按真实尺度铺
   （长条枋不会把石纹拉成条纹，砖墙上的石块也是 40cm 一块而不是一整面） */
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

/* 顶点色明暗：朝上的面吃天光更亮、朝下更暗；再叠一层缓慢的高度渐变
   —— 这一层是"不塑料"的关键：光影有了，材质才有体积
   tone：整件色调档（石件分「基座深 / 柱身中 / 雕饰浅」三档）
   grain：木纹色带（grainMode 'v' = 竖纹走柱身，'h' = 横纹走枋梁） */
function shade(g, opt = {}) {
  const p = g.attributes.position, nrm = g.attributes.normal;
  const n = p.count;
  const col = new Float32Array(n * 3);
  const y0 = opt.y0 ?? 0, y1 = opt.y1 ?? 1;
  const s0 = opt.s0 ?? .86, s1 = opt.s1 ?? 1.08;
  const up = opt.up ?? .18, jit = opt.jit ?? .05;
  const tone = opt.tone ?? 1;
  const grain = opt.grain ?? 0;
  const gmode = opt.grainMode ?? 'auto';
  /* 整件包围盒：木纹要绕着"这件东西自己的轴"转 */
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0b = 1e9, y1b = -1e9;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
    if (y < y0b) y0b = y; if (y > y1b) y1b = y;
  }
  const cx = (x0 + x1) * .5, cz = (z0 + z1) * .5;
  const alongX = (x1 - x0) >= (z1 - z0);
  /* 竖着的件走竖纹（柱子），横着的件走横纹（枋梁） */
  const vertical = (y1b - y0b) > Math.max(x1 - x0, z1 - z0);
  const useV = gmode === 'auto' ? vertical : (gmode === 'v');
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let t = (y - y0) / Math.max(1e-4, y1 - y0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    let k = s0 + (s1 - s0) * t;
    if (nrm) k *= 1 + up * nrm.getY(i);
    if (jit) {
      /* 缓慢的空间斑驳（不用随机数，同 seed 必得同一张图） */
      const v = 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9 + y * 0.4) * Math.cos(z * 1.3 - y * 0.7);
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

/* 凿痕：低频顶点起伏（±amp）。石头不能是一块光板。
   方向场只跟位置有关 → 相邻面的公共顶点位移一致，不会裂开；
   位移在件的上下端收为 0 → 上下层石构件仍然严丝合缝地叠着。 */
function chisel(g, amp = 0.02, freq = 1.15) {
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
    const fade = Math.min(1, 5 * Math.min(ty, 1 - ty));   // 上下端不位移
    const k = (nv / 1.55) * amp * fade;
    p.setXYZ(i, x + dx / L * k, y + dy / L * k, z + dz / L * k);
  }
  g.computeVertexNormals();
  return g;
}
/* 细分盒子 + 凿痕：粗凿的石头，不是塑料板 */
function boxC(w, h, d, x, y, z, seg = 3, amp = 0.02) {
  const g = new THREE.BoxGeometry(w, h, d, seg, Math.max(1, seg >> 1), seg);
  g.translate(x, y, z);
  return chisel(g, amp);
}
/* 上细下粗：木柱/望柱带收分，绕件自己的轴缩放 */
function taperY(g, k = 0.90) {
  const p = g.attributes.position;
  const n = p.count;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ymin = 1e9, ymax = -1e9;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
  }
  const cx = (x0 + x1) * .5, cz = (z0 + z1) * .5, hh = Math.max(1e-4, ymax - ymin);
  for (let i = 0; i < n; i++) {
    const y = p.getY(i);
    const t = (y - ymin) / hh;
    const s = 1 - (1 - k) * t;
    p.setXYZ(i, cx + (p.getX(i) - cx) * s, y, cz + (p.getZ(i) - cz) * s);
  }
  g.computeVertexNormals();
  return g;
}

/* 材质克隆：统一开 vertexColors，改色/改金属度都不动共享材质
   color 可以给 [r,g,b]（线性值，允许 >1）：贴图本身已经带色，
   再用深色去乘，木头就会黑成一根焦炭。 */
function matClone(base, over = {}) {
  const m = base.clone();
  for (const k in over) {
    if (k === 'color' || k === 'emissive') {
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
   塔是"硬边坐在山坡上"的最大受害者：山把台基埋掉一半，
   须弥座底下那一圈全靠软影才不悬。贴图/材质都借 ao.js 的共享资源，
   所有贴片合成一个 mesh —— 只多 1 个 draw call。 */
let _aoMat = null;
function aoMaterial() {
  if (_aoMat) return _aoMat;
  const src = aoPatch(1, .5).material;
  _aoMat = new THREE.MeshBasicMaterial({
    map: src.map, transparent: true, depthWrite: false,
    blending: THREE.MultiplyBlending, vertexColors: true,
    side: THREE.FrontSide, toneMapped: false,
  });
  _aoMat.name = 'mat-pagoda-ao';
  return _aoMat;
}
function aoDisc(x, z, r, s, y = 0.02) {
  const g = new THREE.CircleGeometry(1, 20);
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
/* 环形接地阴影：紧贴须弥座外沿的一圈软影。
   用方格网而不是一叠小圆盘：MultiplyBlending 是相乘的，
   叠十几张会黑成一块；网格 + 顶点色环，能把"暗"精确放到想要的半径上。
   UV 按世界尺度铺 → 共用 ao.js 的径向贴图；中心那圈正好被须弥座盖住。 */
function aoRingGeo(rIn, rOut, s, y = 0.02, N = 44, band = 1.10) {
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

  const G = { stone: [], dark: [], brick: [], tile: [], copper: [], wood: [], gold: [], brass: [] };
  /* tone：整件的色调档 —— 石件分「基座深 / 柱身中 / 雕饰浅」三档。
     档位记在件上，合批前逐件写进顶点色；合批后就分不出哪块是哪块了。 */
  const TONE = new Map();
  const P = (k, g, tone = 1) => { G[k].push(g); TONE.set(g, tone); };

  /* 材质：全部克隆自 MAT，统一开 vertexColors（明暗靠顶点色给）
     brick 用石材贴图 + 暖灰 Brick 色（原来用白灰泥，干净得像泡沫板）
     copper 是塔顶铜瓦：金属度高、粗糙度低，吃天空的环境反射 */
  const M2 = {
    stone: matClone(MAT.stone, { color: 0xb4b0a4 }),                // 柱身中（贴图已带灰，别再压深）
    dark: matClone(MAT.stoneDark, { color: 0x848177 }),             // 勾缝 / 压边（最暗）
    brick: matClone(MAT.stone, { color: 0xc7b39c }),                // 砖身（暖一点）
    tile: matClone(MAT.tile, { color: 0xa8aeb6 }),
    copper: matClone(MAT.gold, { color: 0x9c7c3c, metalness: .88, roughness: .30, emissive: 0x000000 }),
    wood: matClone(MAT.wood, { color: [1.45, 1.24, 0.94] }),       // 木料：贴图自带深棕，别再压深
    gold: matClone(MAT.gold, {}),
    brass: matClone(MAT.brass, { metalness: .88, roughness: .26 }),
  };

  /* ═══ 1. 石台地（挡土墙 + 铺地，顶面比地面高 30cm） ═══════════════
     台地是一块厚板（-0.55 → +0.30），不是一张浮在地上的皮：
     下半截埋进土里，上半截露成 30cm 的台明，接地阴影正好落在台面上。 */
  P('stone', boxC(PLAT_SIZE, 0.85, PLAT_SIZE, 0, -0.125, 0, 5, 0.022), 0.72);
  const ED = PLAT_SIZE / 2;
  /* 压顶石：台地边缘一圈略挑出的深色石带（读作"台明收边"） */
  P('dark', boxG(PLAT_SIZE + 0.44, 0.22, 0.36, 0, PLAT_H - 0.13, -(ED + 0.12)), 0.92);
  P('dark', boxG(PLAT_SIZE + 0.44, 0.22, 0.36, 0, PLAT_H - 0.13, ED + 0.12), 0.92);
  P('dark', boxG(0.36, 0.22, PLAT_SIZE + 0.44, -(ED + 0.12), PLAT_H - 0.13, 0), 0.92);
  P('dark', boxG(0.36, 0.22, PLAT_SIZE + 0.44, ED + 0.12, PLAT_H - 0.13, 0), 0.92);
  /* 散水：台明脚下贴地的一圈斜坡石，不浮在草上 */
  for (let k = 0; k < 4; k++) {
    const s = k % 2 ? 1 : -1, along = k < 2 ? 0 : 1;
    const g = boxG(along ? 0.5 : PLAT_SIZE + 1.0, 0.09, along ? PLAT_SIZE + 1.0 : 0.5,
      along ? s * (ED + 0.15) : 0, 0.045, along ? 0 : s * (ED + 0.15));
    P('dark', g, 0.88);
  }
  /* 铺地石缝：给台面一个真实的铺装尺度（2.125m 一格） */
  for (let k = 1; k <= 7; k++) {
    const p = -ED + (PLAT_SIZE / 8) * k;
    P('dark', boxG(0.055, 0.008, PLAT_SIZE - 0.10, p, PLAT_H + 0.004, 0), 1.0);
    P('dark', boxG(PLAT_SIZE - 0.10, 0.008, 0.055, 0, PLAT_H + 0.004, p), 1.0);
  }

  /* ═══ 2. 须弥座：圭角 → 束腰 → 上枋 → 台面 ═════════════ */
  const GUA = 9.80, SHU = 9.00, SHANG = 9.60, TAI = 9.20;
  /* 须弥座先按"座高"坐标造好，最后整体抬到台地顶面（+PLAT_H） */
  const L = { stone: [], dark: [] };
  const SP = (k, g, tone = 1) => { L[k].push(g); TONE.set(g, tone); };
  SP('stone', boxC(GUA, 0.50, GUA, 0, 0.25, 0, 5, 0.022), 0.72);                 // 圭角（基座深）
  SP('stone', boxC(GUA + 0.14, 0.12, GUA + 0.14, 0, 0.56, 0, 4, 0.016), 0.72);   // 圭角压边
  SP('stone', boxC(SHU, 0.32, SHU, 0, 0.78, 0, 4, 0.018), 1.00);                 // 束腰（柱身中）
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
      SP('stone', g, 1.34);                          // 雕饰浅
    }
  }
  /* 束腰壸门：四面各 4 个上端半圆的凹龛（浅色雕饰 + 内壁压暗） */
  {
    const W = 0.78, H = 0.30, RR = 0.15;
    const s = new THREE.Shape();
    s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, H - RR);
    s.absarc(0, H - RR, RR, 0, Math.PI, false);
    s.lineTo(-W / 2, 0);
    const FACES = [
      { rot: 0, cx: 0, cz: SHU / 2 },
      { rot: Math.PI / 2, cx: SHU / 2, cz: 0 },
      { rot: Math.PI, cx: 0, cz: -SHU / 2 },
      { rot: -Math.PI / 2, cx: -SHU / 2, cz: 0 },
    ];
    for (const F of FACES) {
      const ox = Math.sin(F.rot), oz = Math.cos(F.rot);   // 该面的朝外方向
      const ax = Math.cos(F.rot), az = -Math.sin(F.rot);  // 该面的沿墙方向
      for (let k = 0; k < 4; k++) {
        const u = -3.0 + k * 2.0;
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 8 });
        g.rotateY(F.rot);
        /* 往墙里埋 4.5cm，只露 5cm 不到 —— 读作凹龛而不是贴上去的牌子 */
        g.translate(u * ax + F.cx - ox * 0.045, 0.655, u * az + F.cz - oz * 0.045);
        SP('stone', g, 1.36);
      }
    }
  }
  /* 圭角四角角柱：须弥座的转角要有"角"，不能是圆角钝块 */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    SP('stone', boxC(0.62, 0.50, 0.62, sx * (GUA / 2 - 0.30), 0.25, sz * (GUA / 2 - 0.30), 3, 0.018), 1.06);
    SP('dark', boxG(0.70, 0.09, 0.70, sx * (GUA / 2 - 0.30), 0.54, sz * (GUA / 2 - 0.30)), 1.10);
  }
  SP('stone', boxC(SHANG, 0.34, SHANG, 0, 1.11, 0, 4, 0.018), 1.00);              // 上枋 0.94~1.28
  SP('stone', boxC(TAI, 0.22, TAI, 0, 1.39, 0, 4, 0.016), 1.02);                 // 台面 1.28~1.50
  SP('dark', boxG(TAI + 0.10, 0.06, TAI + 0.10, 0, 1.31, 0), 1.05);              // 台面束带
  /* 须弥座坐上台地 */
  for (const k of Object.keys(L)) for (const g of L[k]) { g.translate(0, PLAT_H, 0); P(k, g); }

  /* ═══ 3. 南面石阶 + 两侧矮石栏（望柱 + 栏板） ═══════════ */
  const sw = 2.80, steps = 8, tread = 0.38;
  const rise = PED_H / 9;                 // 每级 16.7cm：从台面 1.80 降到台地 0.30
  const z0 = TAI / 2;
  {
    for (let i = 0; i < steps; i++) {
      const top = BASE_Y - rise * (i + 1);
      const z = z0 + tread * (i + 0.5);
      P('stone', boxC(sw, top - PLAT_H, tread, 0, PLAT_H + (top - PLAT_H) / 2, z, 3, 0.016), 0.92);
      if (top - 0.07 > PLAT_H) P('dark', boxG(sw, 0.07, 0.14, 0, top - 0.035, z + tread / 2 - 0.07), 1.0);
    }
    for (const sx of [-1, 1]) {
      const x = sx * (sw / 2 + 0.24);
      const posts = [];
      for (let k = 0; k <= 8; k += 2) {
        const z = z0 + tread * k;
        const base = k === 0 ? BASE_Y : (k >= 8 ? PLAT_H : BASE_Y - rise * k);
        const tall = (k === 0 || k === 8);
        const h = tall ? 0.80 : 0.62;
        const w = tall ? 0.18 : 0.13;
        P('stone', taperY(boxC(w, h, w, x, base + h / 2, z, 2, 0.012), 0.90), 1.04);
        if (tall) P('dark', boxG(w + 0.09, 0.10, w + 0.09, x, base + h + 0.05, z), 1.12);  // 望柱头
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
    const y0 = BASE_Y + i * PITCH;

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
      P('brick', panel, 1.0);

      /* 砖缝带：水平砌层，遇券洞断开。
         注意 z = TH - 0.012：墙的外表面在局部 z = TH，
         缝要凸出墙面 5mm 才看得见（原来埋在墙里，等于没画）。 */
      for (let yc = 0.16; yc <= WALL_H - 0.16; yc += 0.30) {
        const hw2 = holeHalf(f.op, yc);
        const segs = hw2 > 0.02
          ? [[-f.len / 2, -hw2], [hw2, f.len / 2]]
          : [[-f.len / 2, f.len / 2]];
        for (const [a, b] of segs) {
          if (b - a < 0.06) continue;
          const g = boxG(b - a, 0.045, 0.035, (a + b) / 2, yc, TH - 0.012);
          g.rotateY(f.rotY); g.translate(f.ox, y0, f.oz);
          P('dark', g, 0.78);
        }
      }
      /* 竖缝：每 ~62cm 一道，把白墙读成"砖砌的塔身" */
      {
        const nV = Math.max(2, Math.round(f.len / 0.62));
        const segs = [];
        if (f.op.base > 0.08) segs.push([0.05, f.op.base]);
        if (f.op.base + f.op.h < WALL_H - 0.08) segs.push([f.op.base + f.op.h, WALL_H - 0.05]);
        for (let k = 1; k < nV; k++) {
          const jx = -f.len / 2 + f.len * k / nV;
          for (const [ya, yb] of segs) {
            if (yb - ya < 0.08) continue;
            const g = boxG(0.035, yb - ya, 0.035, jx, (ya + yb) / 2, TH - 0.012);
            g.rotateY(f.rotY); g.translate(f.ox, y0, f.oz);
            P('dark', g, 0.78);
          }
        }
      }

      /* 洞内暗木衬板（门扇 / 窗背） */
      const back = boxG(f.op.w + 0.18, f.op.h + 0.06, 0.06, 0, f.op.base + f.op.h / 2 + 0.03, -0.28);
      back.rotateY(f.rotY); back.translate(f.ox, y0, f.oz);
      P('wood', back, 0.66);

      /* 窗上木格 */
      if (!f.isDoor) {
        for (const lx of [-f.op.w * 0.24, f.op.w * 0.24]) {
          const g = boxG(0.05, f.op.h * 0.60, 0.05, lx, f.op.base + f.op.h * 0.42, -0.24);
          g.rotateY(f.rotY); g.translate(f.ox, y0, f.oz);
          P('wood', g, 0.80);
        }
      }

      /* 斗拱：连续檐枋 + 一排斗栱 + 昂
         全部按"墙外表面（局部 z = TH）"往外排 —— 原来的斗栱埋在墙体里，
         从外面根本看不到，檐下是空的。 */
      const zhu = boxG(f.len, 0.12, 0.20, 0, 2.88, TH + 0.05);
      zhu.rotateY(f.rotY); zhu.translate(f.ox, y0, f.oz);
      P('wood', zhu, 0.94);
      const nB = Math.max(3, Math.round(f.len / 1.05));
      for (let k = 0; k < nB; k++) {
        const bx = -f.len / 2 + f.len * (k + 0.5) / nB;
        const parts = [
          boxG(0.24, 0.14, 0.26, bx, 2.68, TH + 0.10),   // 斗
          boxG(0.16, 0.11, 0.50, bx, 2.80, TH + 0.24),    // 出挑拱
          boxG(0.56, 0.11, 0.19, bx, 2.80, TH + 0.07),    // 横拱
          boxG(0.18, 0.10, 0.22, bx, 2.90, TH + 0.08),    // 二层小斗
          boxG(0.50, 0.09, 0.16, bx, 2.92, TH + 0.12),    // 二层拱
        ];
        /* 昂：斜挑出去的挑檐枋 */
        parts.push(barG([bx, 2.54, TH + 0.02], [bx, 2.82, TH + 0.70], 0.11, 0.13));
        for (const g of parts) { g.rotateY(f.rotY); g.translate(f.ox, y0, f.oz); P('wood', g, 0.98); }
      }
    }

    /* 墙帽 */
    P('brick', boxG(w + 0.16, 0.10, w + 0.16, 0, y0 + WALL_H + 0.05, 0), 0.96);

    /* ── 檐：瓦面 + 瓦垄 + 角脊 + 檐板 + 瓦当 + 檐椽 ──
       顶层用铜瓦（金属度 .88，吃天空环境反射），下面几层用黛瓦 */
    const isTop = (i === LEVELS - 1);
    const RF = isTop ? 'copper' : 'tile';
    const E = { ri: hw + 0.10, ro: hw + EAVE_OUT, yI: y0 + 3.02, yT: y0 + 2.58, up: UPTURN };
    /* 屋面：paramSurface 的三角形绕序在这个参数化下法线朝下 ——
       从上往下看整片屋面被背面剔除，只剩瓦垄和椽子浮在空中（屋顶像一堆散条）。
       这里把绕序反过来，法线随之朝上，屋面才是一整片瓦。 */
    const roof = paramSurface((u, v) => eavePt(u, v, E), 132, 8);
    {
      const ix = roof.getIndex().array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      roof.getIndex().needsUpdate = true;
      roof.computeVertexNormals();
    }
    P(RF, roof);

    /* 瓦垄（一片片筒瓦，沿坡向排） */
    const nR = Math.max(16, Math.round(4 * (2 * hw) / 0.34));
    for (let k = 0; k < nR; k++) {
      const u = (k + 0.5) / nR;
      const a = eavePt(u, 0.03, E), b = eavePt(u, 0.985, E);
      a[1] += 0.02; b[1] += 0.02;
      P(RF, barG(a, b, 0.11, 0.05));
    }
    /* 角脊：盖住四角起翘的转折 */
    for (const u of [0, 0.25, 0.5, 0.75]) {
      const a = eavePt(u, 0.02, E), b = eavePt(u, 0.99, E);
      a[1] += 0.05; b[1] += 0.05;
      P(RF, barG(a, b, 0.17, 0.14));
    }
    /* 檐板 + 瓦当 */
    const nB2 = 8;
    for (let k = 0; k < 4 * nB2; k++) {
      const a = eavePt(k / (4 * nB2), 1.0, E), b = eavePt((k + 1) / (4 * nB2), 1.0, E);
      a[1] -= 0.055; b[1] -= 0.055;
      P(RF, barG(a, b, 0.09, 0.12));
    }
    for (let k = 0; k < nR; k++) {
      const u = (k + 0.5) / nR;
      const p = eavePt(u, 1.0, E);
      const od = outward(u);
      P(RF, cylG(0.075, 0.07, [p[0] + od[0] * 0.03, p[1] - 0.02, p[2] + od[1] * 0.03], od, 8));
    }
    /* 檐椽：托在瓦面下面的放射椽子 */
    const nF = Math.max(12, Math.round(4 * (2 * hw) / 0.55));
    for (let k = 0; k < nF; k++) {
      const u = (k + 0.5) / nF;
      const a = eavePt(u, 0.04, E), b = eavePt(u, 0.97, E);
      a[1] -= 0.06; b[1] -= 0.04;
      P('wood', barG(a, b, 0.07, 0.07), 0.84);
    }

    /* ── 平座 + 勾栏 ── */
    P('stone', boxC(w + 2 * BALC_OUT, 0.12, w + 2 * BALC_OUT, 0, y0 + 2.99, 0, 4, 0.016), 1.02);
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
          P('wood', taperY(boxG(0.11, 0.52, 0.11, x, y0 + 3.31, z), 0.86), 1.02);
        }
        P('wood', barG([s.a[0], y0 + 3.52, s.a[1]], [s.b[0], y0 + 3.52, s.b[1]], 0.07, 0.09), 0.92);
        P('wood', barG([s.a[0], y0 + 3.28, s.a[1]], [s.b[0], y0 + 3.28, s.b[1]], 0.05, 0.06), 0.84);
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
  const topY = BASE_Y + LEVELS * PITCH;          // 23.15
  P('stone', cylG(0.95, 0.14, [0, topY + 0.07, 0], [0, 1, 0], 18));
  P('stone', cylG(0.74, 0.10, [0, topY + 0.19, 0], [0, 1, 0], 18));
  const bowlBase = topY + 0.24;
  {
    const prof = [[0.30, 0], [0.38, 0.10], [0.50, 0.28], [0.60, 0.48], [0.64, 0.66], [0.60, 0.80], [0.52, 0.86]]
      .map(q => new THREE.Vector2(q[0], q[1]));
    const bowl = new THREE.LatheGeometry(prof, 20);
    bowl.translate(0, bowlBase, 0);
    P('gold', bowl);
    /* 覆钵下缘一圈莲瓣：没有这圈，塔刹就是一根光杆插在球里 */
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const pet = new THREE.SphereGeometry(0.115, 8, 6);
      pet.scale(0.42, 1.5, 0.9);
      pet.rotateZ(-0.34);
      pet.translate(Math.cos(a) * 0.40, bowlBase + 0.06, Math.sin(a) * 0.40);
      P('gold', pet);
    }
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

  /* ═══ 6. 合批出 mesh ═══════════════════════════════════
     每个桶合一个 mesh；顶点色（明暗）合完再算，
     这样"朝上的面亮、朝下的面暗"是按合并后的真实法线算的。 */
  const Y1 = topY + 3.0;
  const SHADE = {
    stone: { y0: 0, y1: Y1, s0: .84, s1: 1.02, up: .22, jit: .06 },
    dark: { y0: 0, y1: Y1, s0: .74, s1: .94, up: .18, jit: .05 },
    brick: { y0: 0, y1: Y1, s0: .86, s1: 1.06, up: .16, jit: .05 },
    tile: { y0: 0, y1: Y1, s0: .86, s1: 1.10, up: .26, jit: .05 },
    copper: { y0: 0, y1: Y1, s0: .84, s1: 1.08, up: .30, jit: .04 },
    wood: { y0: 0, y1: Y1, s0: .78, s1: 1.10, up: .26, jit: .06, grain: .085 },
    gold: { y0: 0, y1: Y1, s0: .88, s1: 1.12, up: .30, jit: .04 },
    brass: { y0: 0, y1: Y1, s0: .86, s1: 1.08, up: .28, jit: .04 },
  };
  const UVS = { stone: 12.8, dark: 12.8, brick: 6.4, wood: 2.4 };
  let drawCalls = 0;
  for (const key of Object.keys(M2)) {
    if (!G[key].length) continue;
    /* 逐件上色再合批：色调档与木纹都是"每一件"的属性，
       合完批就再也分不出哪块石头是哪块了。 */
    for (const g of G[key]) {
      if (UVS[key]) planarUV(g, UVS[key]);
      shade(g, Object.assign({}, SHADE[key], { tone: TONE.get(g) ?? 1 }));
    }
    const m = meshOf(G[key], M2[key]);
    if (!m) continue;
    m.name = 'pagoda-' + key;
    group.add(m);
    drawCalls++;
  }

  /* ═══ 7. 接地阴影：须弥座脚下一圈软影 ══════════════════════
     影落在塔前石台地（y = PLAT_H）上，紧贴圭角外沿；
     山那一侧地形高过台地，贴片自然被埋掉 —— 影的位置跟着地势走，不穿帮。
     石阶脚下再补两片小影（core/ao.js 的 aoBatch），台阶才不是"贴"在台面上的。 */
  {
    const ring = aoRingGeo(4.95, 7.20, .42, PLAT_H + 0.012, 40, 0.95);
    const patches = aoBatch([
      { x: 0, z: z0 + tread * 7.4, r: 0.95, s: .38 },
      { x: 0, z: z0 + tread * 6.6, r: 0.72, s: .26 },
    ], aoMaterial());
    for (const g of patches) g.translate(0, PLAT_H, 0);
    const geo = mergeGeometries([nonIndexed(ring), ...patches.map(nonIndexed)], false);
    const aoMesh = new THREE.Mesh(geo, aoMaterial());
    aoMesh.name = 'pagoda-ao';
    aoMesh.renderOrder = 2;
    aoMesh.castShadow = false;
    aoMesh.receiveShadow = false;
    aoMesh.matrixAutoUpdate = false;
    group.add(aoMesh);
    drawCalls++;
  }

  group.userData = { drawCalls, levels: LEVELS };
  group.position.set(tw.x, 0, tw.z);            // 落在 layout.tower 上，rot = 0（正南北向）
  return group;
}
