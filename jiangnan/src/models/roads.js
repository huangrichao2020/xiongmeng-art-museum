/* 江南古村 · 道路模块
   ------------------------------------------------------------------
   只做「路」这一层：路面 / 主街排水沟 + 路缘石 / 路边草苔。

   契约（SPEC + 本模块约定）：
     · 纯函数，只读 layout；随机数一律 makeRng(seed ^ 0x55)，不用 Math.random。
     · 路面严格水平：顶面 y = 0.03，底面 -0.02（沉进地里，绝不与地形 z-fighting）。
     · 宽度：主街 3.4m（整块青石板）/ 干道 2.4m（碎石板）/ 小径 1.7m（夯土）。
     · 交叉口：不同种类之间、同一路网的不同段之间，互相裁掉重叠的矩形 ——
       所以永远不会出现「双层叠加的高台」，也不会共面闪烁（z-fighting）。
     · 段端外延 0.3m，与相邻段自然衔接，不做突兀截断。
     · 质量线：石板接缝靠 MAT.stone 自带的 bumpMap；路缘石一块块、带高低与
       深浅错落；路边有 instanced 的草簇与青苔。
     · draw call：路面 3 + 排水沟 1 + 路缘石 1(instanced) + 草 1 + 苔 1 = 7。 */
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { MAT, initMaterials } from '../core/materials.js';
import { mergeGeometries, meshOf, nonIndexed } from '../core/geo.js';

/* ── 参数 ────────────────────────────────────────────── */
const ROAD_Y = 0.03;        // 路面顶标高
const ROAD_BOT = -0.02;     // 路面底（埋进地里）
const OVERHANG = 0.30;      // 段端外延，和邻段衔接
const EPS = 1e-6;
const FRAG_MIN = 0.02;      // 小于这个宽度的碎片直接丢（退化面）

const KIND = {
  main:  { w: 3.40, mat: 'stone',     uS: 13.44, verge: 0.44 },  // 整块青石板
  stone: { w: 2.40, mat: 'stoneDark', uS: 9.60,  verge: 0.10 },  // 碎石板
  dirt:  { w: 1.70, mat: 'dirt',      uS: 5.00,  verge: 0.08 },  // 夯土
};
const KIND_ORDER = ['main', 'stone', 'dirt'];   // 优先级：靠前的先占地方

const GUT_W = 0.22;         // 排水沟宽（浅凹槽）
const GUT_Y = 0.008;        // 沟底标高：比路面低 2.2cm，形成下沉暗色条
const GUT_UV = 6.0;         // 沟底贴图尺度（小碎石/淤泥感）
const KERB_W = 0.18;        // 路缘石宽
const KERB_TOP = 0.09;      // 路缘石顶标高基准（高出路面 6cm）
const KERB_JIT = 0.018;     // 路缘石高低错落幅度
const KERB_GAP = 0.05;      // 石块之间的缝

const GRASS_STEP = 1.25;    // 草簇间距
const MOSS_STEP = 0.85;     // 青苔间距
const MAX_FRAG = 4000;      // 碎片数保护（正常远达不到）

/* ── 小工具 ──────────────────────────────────────────── */
function seedOf(layout) {
  const s = layout.seed;
  if (typeof s === 'number' && isFinite(s)) return s | 0;
  const n = parseInt(String(s), 10);
  return isNaN(n) ? 0 : (n | 0);
}

/* UV 用世界坐标：贴图按真实尺度铺，石块接缝才对得上路宽 */
function worldUV(g, S) {
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / S, p.getZ(i) / S);
  uv.needsUpdate = true;
}
function quadXZ(x0, z0, x1, z1, y, S) {
  const g = new THREE.PlaneGeometry(Math.max(x1 - x0, 0.001), Math.max(z1 - z0, 0.001), 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  worldUV(g, S);
  return g;
}
function boxXZ(x0, z0, x1, z1, y0, y1, S) {
  const g = new THREE.BoxGeometry(
    Math.max(x1 - x0, 0.001), Math.max(y1 - y0, 0.001), Math.max(z1 - z0, 0.001));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  worldUV(g, S);
  return g;
}
/* 草丛：几片交叉的小叶片 */
function tuftGeo(w, h, planes) {
  const parts = [];
  for (let i = 0; i < planes; i++) {
    const p = new THREE.PlaneGeometry(w, h, 1, 1);
    p.translate(0, h / 2, 0);
    p.rotateY((i / planes) * Math.PI + 0.2);
    parts.push(nonIndexed(p));
  }
  return mergeGeometries(parts, false);
}
/* 路缘石：单位盒 + 按名义尺寸烘好的 UV。
   实例缩放后长 1.2~2.0m、厚 0.18m、高约 0.11m，
   UV 按真实尺度铺 → 石面是"一块整石"，不会被拉成条纹。 */
function kerbGeo(nomL, nomH, nomW, S) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);          // 0/1 = ±X 端面，2/3 = ±Y 顶底，4/5 = ±Z 长侧面
    const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
    let u, v;
    if (face === 0 || face === 1) { u = (lz + .5) * nomW / S; v = (ly + .5) * nomH / S; }
    else if (face === 2 || face === 3) { u = (lx + .5) * nomL / S; v = (lz + .5) * nomW / S; }
    else { u = (lx + .5) * nomL / S; v = (ly + .5) * nomH / S; }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return g;
}
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
    if (it.c) m.setColorAt(i, it.c);
  }
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ── 矩形裁剪（轴对齐） ───────────────────────────────── */
/* a \ b：返回互不重叠的碎片，b 覆盖的地方被挖掉 */
function subRect(a, b) {
  if (b.x1 <= a.x0 + 1e-9 || b.x0 >= a.x1 - 1e-9 ||
      b.z1 <= a.z0 + 1e-9 || b.z0 >= a.z1 - 1e-9) return [a];
  const out = [];
  const ox0 = Math.max(a.x0, b.x0), ox1 = Math.min(a.x1, b.x1);
  const oz0 = Math.max(a.z0, b.z0), oz1 = Math.min(a.z1, b.z1);
  if (a.x0 < ox0 - 1e-9) out.push({ x0: a.x0, x1: ox0, z0: a.z0, z1: a.z1 });
  if (ox1 < a.x1 - 1e-9) out.push({ x0: ox1, x1: a.x1, z0: a.z0, z1: a.z1 });
  if (a.z0 < oz0 - 1e-9) out.push({ x0: ox0, x1: ox1, z0: a.z0, z1: oz0 });
  if (oz1 < a.z1 - 1e-9) out.push({ x0: ox0, x1: ox1, z0: oz1, z1: a.z1 });
  return out;
}
function subAll(frags, b) {
  const out = [];
  for (const f of frags) {
    for (const g of subRect(f, b)) out.push(g);
    if (out.length > MAX_FRAG) break;
  }
  return out.length > MAX_FRAG ? frags : out;
}

/* ── 段 → 矩形足迹 ───────────────────────────────────── */
function rectOf(r, w) {
  const horiz = Math.abs(r.z2 - r.z1) < EPS;
  if (horiz) {
    return {
      x0: Math.min(r.x1, r.x2) - OVERHANG, x1: Math.max(r.x1, r.x2) + OVERHANG,
      z0: r.z1 - w / 2, z1: r.z1 + w / 2, horiz,
    };
  }
  return {
    x0: r.x1 - w / 2, x1: r.x1 + w / 2,
    z0: Math.min(r.z1, r.z2) - OVERHANG, z1: Math.max(r.z1, r.z2) + OVERHANG, horiz,
  };
}

/* 两段正交直线的交点（不交返回 null） */
function segCross(a, b) {
  const ah = Math.abs(a.z2 - a.z1) < EPS, bh = Math.abs(b.z2 - b.z1) < EPS;
  if (ah === bh) return null;                       // 平行
  const h = ah ? a : b, v = ah ? b : a;
  const px = v.x1, pz = h.z1;
  if (px < Math.min(h.x1, h.x2) - EPS || px > Math.max(h.x1, h.x2) + EPS) return null;
  if (pz < Math.min(v.z1, v.z2) - EPS || pz > Math.max(v.z1, v.z2) + EPS) return null;
  return { x: px, z: pz };
}

/* ── 规划（纯数学，不碰 THREE，方便单独跑数） ─────────── */
export function planRoads(layout, rng) {
  const roads = (layout.roads || []).filter(r => r && KIND[r.kind]);
  const segs = { main: [], stone: [], dirt: [] };
  const length = { main: 0, stone: 0, dirt: 0 };

  for (const r of roads) {
    const k = KIND[r.kind];
    const rect = rectOf(r, k.w);
    const horiz = rect.horiz;
    const axis = horiz ? r.z1 : r.x1;               // 中心线所在坐标
    const s0 = horiz ? Math.min(r.x1, r.x2) - OVERHANG : Math.min(r.z1, r.z2) - OVERHANG;
    const s1 = horiz ? Math.max(r.x1, r.x2) + OVERHANG : Math.max(r.z1, r.z2) + OVERHANG;
    segs[r.kind].push({ rect, horiz, axis, s0, s1, raw: r, blocked: [] });
    length[r.kind] += Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
  }

  /* 交叉口：别的路穿过主街的地方，路缘石要断开（别把石头砌在路口上） */
  for (const m of segs.main) {
    for (const kind of ['stone', 'dirt']) {
      for (const o of segs[kind]) {
        const c = segCross(m.raw, o.raw);          // 用原始段坐标判交点
        if (!c) continue;
        const half = KIND[kind].w / 2 + 0.06;
        const s = m.horiz ? c.x : c.z;
        m.blocked.push([s - half, s + half]);
      }
    }
  }

  /* 裁剪：不同种类按优先级互相挖，同种类先来先占 —— 交叉口绝不叠高台 */
  const paving = { main: [], stone: [], dirt: [] };
  for (const kind of KIND_ORDER) {
    for (const s of segs[kind]) {
      let frags = [s.rect];
      for (const hi of KIND_ORDER.slice(0, KIND_ORDER.indexOf(kind))) {
        for (const f of paving[hi]) frags = subAll(frags, f);
      }
      for (const f of paving[kind]) frags = subAll(frags, f);
      for (const f of frags) {
        if (f.x1 - f.x0 < FRAG_MIN || f.z1 - f.z0 < FRAG_MIN) continue;
        paving[kind].push(f);
      }
    }
  }

  /* 主街排水沟：两侧各一条 0.22m 宽的浅凹槽（沟底在下沉暗色条上） */
  const gutters = [];
  for (const m of segs.main) {
    const half = KIND.main.w / 2;
    for (const side of [-1, 1]) {
      if (m.horiz) {
        const z0 = m.axis + side * half, z1 = m.axis + side * (half + GUT_W);
        gutters.push({ x0: m.s0, x1: m.s1, z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
      } else {
        const x0 = m.axis + side * half, x1 = m.axis + side * (half + GUT_W);
        gutters.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: m.s0, z1: m.s1 });
      }
    }
  }

  /* 路缘石：每 1.2~2m 一块，高低错落、颜色深浅错落 */
  const kerbs = [];
  for (const m of segs.main) {
    const half = KIND.main.w / 2;
    const kerbU = half + GUT_W + KERB_W / 2;        // 2.01m
    for (const side of [-1, 1]) {
      let s = m.s0;
      while (s < m.s1 - 0.25) {
        const len = 1.2 + rng() * 0.8;              // 每块 1.2~2.0m
        const e = Math.min(s + len, m.s1);
        const mid = (s + e) / 2;
        const blocked = m.blocked.some(b => e > b[0] && s < b[1]);
        if (!blocked && e - s > 0.4) {
          const top = KERB_TOP + (rng() - 0.5) * 2 * KERB_JIT;
          const tone = 0.80 + rng() * 0.36;
          kerbs.push({
            x: m.horiz ? mid : m.axis + side * kerbU,
            z: m.horiz ? m.axis + side * kerbU : mid,
            y: (top + ROAD_BOT) / 2,
            len: e - s, h: top - ROAD_BOT,
            ry: m.horiz ? 0 : Math.PI / 2,
            c: new THREE.Color(tone, tone * 0.99, tone * 0.94),
          });
        }
        s = e + KERB_GAP + rng() * 0.06;
      }
    }
  }

  /* 路边草：贴着路肩长一点，稀疏些 */
  const grass = [];
  for (const kind of KIND_ORDER) {
    const k = KIND[kind];
    for (const s of segs[kind]) {
      for (const side of [-1, 1]) {
        let t = s.s0 + rng() * 0.6;
        while (t < s.s1) {
          if (rng() < 0.55) {
            const off = k.w / 2 + k.verge + rng() * 0.26;
            const sc = 0.7 + rng() * 0.75;
            grass.push({
              x: s.horiz ? t : s.axis + side * off,
              y: 0,
              z: s.horiz ? s.axis + side * off : t,
              ry: rng() * Math.PI * 2,
              sx: sc, sy: sc * (0.8 + rng() * 0.5), sz: sc,
            });
          }
          t += GRASS_STEP * (0.65 + rng() * 0.9);
        }
      }
    }
  }

  /* 青苔：主街两侧，靠石缝和沟边长 */
  const moss = [];
  for (const m of segs.main) {
    const half = KIND.main.w / 2;
    for (const side of [-1, 1]) {
      let t = m.s0 + rng() * 0.4;
      while (t < m.s1) {
        if (rng() < 0.5) {
          const inner = rng() < 0.6;
          const off = inner ? half - 0.03 : half + GUT_W - 0.04;
          const sc = 0.5 + rng() * 0.55;
          moss.push({
            x: m.horiz ? t : m.axis + side * off,
            y: inner ? ROAD_Y - 0.01 : GUT_Y,
            z: m.horiz ? m.axis + side * off : t,
            ry: rng() * Math.PI * 2,
            sx: sc, sy: sc * 0.8, sz: sc,
          });
        }
        t += MOSS_STEP * (0.6 + rng() * 0.9);
      }
    }
  }

  const area = { main: 0, stone: 0, dirt: 0 };
  for (const kind of KIND_ORDER) {
    for (const f of paving[kind]) area[kind] += (f.x1 - f.x0) * (f.z1 - f.z0);
  }

  return { segs, paving, gutters, kerbs, grass, moss, length, area };
}

/* ── 主入口 ──────────────────────────────────────────── */
export function build(layout) {
  initMaterials();
  const group = new THREE.Group();
  group.name = 'model-roads';

  const rng = makeRng((seedOf(layout) ^ 0x55) >>> 0);
  const plan = planRoads(layout, rng);

  let drawCalls = 0;
  const push = (m) => { if (m) { group.add(m); drawCalls++; } };

  /* 路面：按 kind 合 3 个大 mesh */
  for (const kind of KIND_ORDER) {
    const frags = plan.paving[kind];
    if (!frags.length) continue;
    const k = KIND[kind];
    const geos = frags.map(f => boxXZ(f.x0, f.z0, f.x1, f.z1, ROAD_BOT, ROAD_Y, k.uS));
    const m = meshOf(geos, MAT[k.mat]);
    m.name = 'road-paving-' + kind;
    push(m);
  }

  /* 排水沟底：下沉暗色条 */
  if (plan.gutters.length) {
    const geos = plan.gutters.map(g => quadXZ(g.x0, g.z0, g.x1, g.z1, GUT_Y, GUT_UV));
    const m = meshOf(geos, MAT.stoneDark);
    m.name = 'road-gutter';
    m.castShadow = false;
    push(m);
  }

  /* 路缘石：一块块，用实例缩放摆位（长度/高度各不相同），深浅用实例色错落 */
  if (plan.kerbs.length) {
    const geo = kerbGeo(1.6, 0.11, KERB_W, KIND.main.uS);
    const m = new THREE.InstancedMesh(geo, MAT.stone, plan.kerbs.length);
    const d = new THREE.Object3D();
    for (let i = 0; i < plan.kerbs.length; i++) {
      const k = plan.kerbs[i];
      d.position.set(k.x, k.y, k.z);
      d.rotation.set(0, k.ry, 0);
      d.scale.set(k.len, k.h, KERB_W);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, k.c);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = true; m.receiveShadow = true;
    m.name = 'road-kerb';
    push(m);
  }

  /* 路边草 + 青苔 */
  push(instanced(tuftGeo(0.30, 0.26, 3), MAT.leaf, plan.grass));
  push(instanced(tuftGeo(0.18, 0.12, 2), MAT.leafDark, plan.moss));

  group.userData = {
    roads: {
      length: plan.length,
      area: plan.area,
      fragments: { main: plan.paving.main.length, stone: plan.paving.stone.length, dirt: plan.paving.dirt.length },
      kerb: plan.kerbs.length,
      gutter: plan.gutters.length,
      grass: plan.grass.length,
      moss: plan.moss.length,
    },
    drawCalls,
  };
  return group;
}
