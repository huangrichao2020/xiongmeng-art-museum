/* 江南古村 · 水系模型（河面 / 驳岸 / 河埠头 / 拱桥）
   ------------------------------------------------------------------
   只吃 layout：纯函数，不读全局，不写 Math.random。
   变化一律走 makeRng(layout.seed ^ 0x44)，同一 seed 必得同一张图。

   高度约定（地面基准 y=0）：
     河面            WATER_Y  = -0.16   （比地面低，岸坡从这里起）
     路面 / 桥脚     ROAD_Y  =  0.04   （桥两端与路面接平）
     桥面拱顶        BRIDGE_CROWN = 0.70 → 高出水面 0.86m（≈0.9m）
     桥身（拱券顶）  0.52              → "拱中间最高 ~0.5m"

   坐标：layout.rivers 是 0 基世界坐标（x1..x2 / z1..z2），横向宽度 w = 米数。
   桥：layout.bridges 只有 {gx,gz}，本模块用"河自己反推跨点"，
       不依赖 originX/originZ 那套口径（生成器里道路/河流/房屋都是 0 基）。 */
import * as THREE from 'three';
import { makeRng, hashStr } from '../core/rng.js';
import { mergeGeometries } from '../core/geo.js';
import { MAT, initMaterials } from '../core/materials.js';

export const WATER_Y = -0.16;      // 河面高度
export const ROAD_Y = 0.04;        // 路面 / 桥脚高度
export const BRIDGE_RISE = 0.66;   // 桥面拱起（相对桥脚）
export const BRIDGE_CROWN = ROAD_Y + BRIDGE_RISE;   // 0.70
export const BRIDGE_W = 2.8;       // 桥面宽

const OVER = 12;      // 河面向网格两端各延伸
const TILE = 5;       // 水面法线贴图每 5m 一个循环
const WALL_BOT = -0.62;   // 驳岸条石底（沉到水下）
const DECK_TH = 0.18;     // 桥面板厚

/* ── 小工具 ───────────────────────────────────────────────── */

/* 只有带索引的才转 non-indexed（mergeGeometries 要求一致） */
function nonIndexed(g) {
  return g.index ? g.toNonIndexed() : g;
}

/* 河上坐标 → 世界坐标：a = 顺河方向，c = 垂直河方向偏移 */
function toWorld(it, a, c) {
  return it.horiz ? { x: a, z: it.center + c } : { x: it.center + c, z: a };
}

/* 位置 / 朝向任选其一即可用的盒子 */
function boxGeo(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/* 由位置数组造几何：position + uv（按 xz 平面铺）+ 法线 */
function geoFromPos(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = pos.length / 3;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = pos[i * 3] * 0.45; uv[i * 2 + 1] = pos[i * 3 + 2] * 0.45; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* 沿局部 X 轴放样出一个闭合的"梁"：
   items = [{u, top, bot}]，截面在 z ∈ [zMin,zMax]。
   同一 u 可以出现两次（顶底不同）→ 用来做墩壁/拱起点的竖直面。 */
function loftSolid(items, zMin, zMax) {
  const pos = [];
  const quad = (a, b, c, d) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    pos.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  };
  for (let i = 0; i < items.length - 1; i++) {
    const s0 = items[i], s1 = items[i + 1];
    const u0 = s0.u, u1 = s1.u;
    const y0t = s0.top, y1t = s1.top, y0b = s0.bot, y1b = s1.bot;
    /* 顶面（法线 +Y） */
    quad([u0, y0t, zMin], [u0, y0t, zMax], [u1, y1t, zMax], [u1, y1t, zMin]);
    /* 底面（法线 -Y） */
    quad([u0, y0b, zMin], [u1, y1b, zMin], [u1, y1b, zMax], [u0, y0b, zMax]);
    /* 侧面 zMin（法线 -Z） */
    quad([u0, y0b, zMin], [u0, y0t, zMin], [u1, y1t, zMin], [u1, y1b, zMin]);
    /* 侧面 zMax（法线 +Z） */
    quad([u0, y0b, zMax], [u1, y1b, zMax], [u1, y1t, zMax], [u0, y0t, zMax]);
  }
  /* 端盖 */
  const s0 = items[0], s1 = items[items.length - 1];
  quad([s0.u, s0.bot, zMin], [s0.u, s0.bot, zMax], [s0.u, s0.top, zMax], [s0.u, s0.top, zMin]);
  quad([s1.u, s1.bot, zMin], [s1.u, s1.top, zMin], [s1.u, s1.top, zMax], [s1.u, s1.bot, zMax]);
  return geoFromPos(pos);
}

/* 分水尖：三角棱柱，尖端朝 -Z */
function wedgeGeo(w, tip, zBase, yBot, yTop) {
  const hw = w / 2;
  const A = [-hw, yBot, zBase], B = [hw, yBot, zBase], C = [0, yBot, zBase - tip];
  const A2 = [-hw, yTop, zBase], B2 = [hw, yTop, zBase], C2 = [0, yTop, zBase - tip];
  const pos = [];
  const tri = (a, b, c) => { pos.push(...a, ...b, ...c); };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  tri(A, C, B); tri(A2, B2, C2);
  quad(A, B, B2, A2);
  quad(B, C, C2, B2);
  quad(C, A, A2, C2);
  return geoFromPos(pos);
}

/* 实例化网格（支持逐实例颜色） */
function instanced(geo, mat, items, colored) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    d.position.set(it.x, it.y, it.z);
    d.rotation.set(0, it.ry || 0, 0);
    d.scale.set(it.sx, it.sy, it.sz);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    if (colored && it.color) { col.set(it.color); m.setColorAt(i, col); }
  }
  m.count = items.length;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ── 主入口 ─────────────────────────────────────────────── */
export function build(layout) {
  initMaterials();
  const seedNum = typeof layout.seed === 'number' ? (layout.seed | 0)
    : (typeof layout.seed === 'string' ? hashStr(layout.seed) : 0);
  const r = makeRng((seedNum ^ 0x44) >>> 0);

  const group = new THREE.Group();
  group.name = 'model-water';

  const cell = layout.cell || 2.5;
  const rivers = layout.rivers || [];
  const bridges = layout.bridges || [];

  /* 河的信息：along = 顺河方向坐标，across = 垂直河方向偏移 */
  const info = rivers.map((rv, id) => {
    const horiz = rv.horiz !== undefined ? !!rv.horiz : Math.abs(rv.x2 - rv.x1) >= Math.abs(rv.z2 - rv.z1);
    return {
      id, rv, horiz,
      w: rv.w,
      center: horiz ? rv.z1 : rv.x1,                 // 河心线坐标
      along0: (horiz ? Math.min(rv.x1, rv.x2) : Math.min(rv.z1, rv.z2)) - OVER,
      along1: (horiz ? Math.max(rv.x1, rv.x2) : Math.max(rv.z1, rv.z2)) + OVER,
      row0: 0, rowW: 0,
    };
  });
  /* 河占的格行/列起点（用于判断桥格、交叉口）
     注意：河心线在格带上居中，所以起点 = 河心格 - 半宽格数 */
  for (const it of info) {
    it.row0 = it.center / cell - it.rv.w / cell / 2;
    it.rowW = it.rv.w / cell;
  }

  /* ── 桥落在哪条河的哪个位置 ───────────────────────────────
     用河自己的格带反查，避开 originX/originZ 口径不一致的问题。 */
  const rawSpots = [];
  for (const b of bridges) {
    let hit = null;
    for (const it of info) {
      if (it.horiz) {
        if (b.gz >= it.row0 - 1e-6 && b.gz < it.row0 + it.rowW) { hit = { it, along: (b.gx + 0.5) * cell }; break; }
        const gzO = b.gz - (layout.H || 0) / 2;
        if (gzO >= it.row0 - 1e-6 && gzO < it.row0 + it.rowW) { hit = { it, along: (b.gx + 0.5) * cell }; break; }
      } else {
        if (b.gx >= it.row0 - 1e-6 && b.gx < it.row0 + it.rowW) { hit = { it, along: (b.gz + 0.5) * cell }; break; }
        const gxO = b.gx - (layout.W || 0) / 2;
        if (gxO >= it.row0 - 1e-6 && gxO < it.row0 + it.rowW) { hit = { it, along: (b.gz + 0.5) * cell }; break; }
      }
    }
    if (hit) rawSpots.push(hit);
  }

  /* 生成器是"每过一个水格记一个桥"，一次过河会留下一串相邻格。
     这里按路口合并，一个跨口只造一座桥。 */
  const bridgeSpots = [];
  rawSpots.sort((a, b) => (a.it.id - b.it.id) || (a.along - b.along));
  for (const s of rawSpots) {
    const last = bridgeSpots[bridgeSpots.length - 1];
    if (last && last.it === s.it && Math.abs(s.along - last.anchor) < cell * 1.4) {
      last.sum += s.along; last.n++;
      last.along = last.sum / last.n;
      continue;
    }
    bridgeSpots.push({ it: s.it, along: s.along, anchor: s.along, sum: s.along, n: 1 });
  }

  /* 某点是否被"占掉"（桥跨口 / 河汊交叉口）——那里不摆石头和埠头 */
  const blocked = (it, a) => {
    for (const s of bridgeSpots) {
      if (s.it === it && Math.abs(a - s.along) < BRIDGE_W / 2 + 1.1) return true;
    }
    for (const o of info) {
      if (o === it || o.horiz === it.horiz) continue;
      if (a > o.center - o.w / 2 - 0.8 && a < o.center + o.w / 2 + 0.8) return true;
    }
    return false;
  };

  const waterParts = [];   // 河面
  const dirtParts = [];    // 土岸 / 岸后土坡
  const stoneParts = [];   // 桥 + 埠头（合一块）
  const revetItems = [];   // 驳岸条石（实例）
  const grassItems = [];   // 草丛（实例）
  const postItems = [];    // 桥望柱（实例）

  /* ═══ 1. 河面 ═══════════════════════════════════════════ */
  for (const it of info) {
    /* 垂直河的交叉口那一段让给另一条河，避免两块水面重叠闪烁 */
    const cuts = [];
    for (const o of info) {
      if (o === it || o.horiz === it.horiz) continue;
      cuts.push([o.center - o.w / 2, o.center + o.w / 2]);
    }
    cuts.sort((a, b) => a[0] - b[0]);
    const pieces = [];
    let cur = it.along0;
    for (const [c0, c1] of cuts) {
      if (c1 <= cur || c0 >= it.along1) continue;
      if (c0 > cur) pieces.push([cur, Math.min(c0, it.along1)]);
      cur = Math.max(cur, c1);
    }
    if (cur < it.along1) pieces.push([cur, it.along1]);

    for (const [a0, a1] of pieces) {
      if (a1 - a0 < 0.5) continue;
      const len = a1 - a0;
      const mid = (a0 + a1) / 2;
      const g = it.horiz
        ? new THREE.PlaneGeometry(len, it.w)
        : new THREE.PlaneGeometry(it.w, len);
      g.rotateX(-Math.PI / 2);
      const su = (it.horiz ? len : it.w) / TILE;
      const sv = (it.horiz ? it.w : len) / TILE;
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
      g.translate(it.horiz ? mid : it.center, WATER_Y, it.horiz ? it.center : mid);
      waterParts.push(g);
    }
  }

  /* ═══ 2. 驳岸 / 土岸 / 草丛 ═══════════════════════════════ */
  for (const it of info) {
    const a0 = it.along0 + 2.5, a1 = it.along1 - 2.5;
    if (a1 <= a0) continue;
    /* 沿河切段：一段石砌驳岸，一段自然土岸 */
    const segs = [];
    let cur = a0;
    while (cur < a1) {
      const len = r.range(7, 16);
      const end = Math.min(a1, cur + len);
      segs.push({ a0: cur, a1: end, stone: r.chance(.74) });
      cur = end;
    }

    for (const seg of segs) {
      for (const side of [-1, 1]) {
        if (seg.stone) {
          /* 石砌驳岸：连续条石，高低错落 */
          let a = seg.a0 + r.range(.15, .5);
          while (a < seg.a1 - .35) {
            const sl = r.range(.55, 1.05);
            const mid = a + sl / 2;
            if (!blocked(it, mid)) {
              const th = r.range(.34, .48);
              const top = 0.03 + r.range(0, .19);
              const bot = WALL_BOT - r.range(0, .12);
              const c = side * (it.w / 2 - .03 - th / 2 + r.range(-.05, .05));
              const p = toWorld(it, mid, c);
              const v = r.range(.70, 1.16);
              const len = sl * r.range(.9, 1.08);
              /* 长边必须顺着河：横河长轴在 X，纵河长轴在 Z */
              revetItems.push({
                x: p.x, y: (top + bot) / 2, z: p.z,
                ry: (it.horiz ? 0 : Math.PI / 2) + r.range(-.07, .07),
                sx: it.horiz ? len : th, sy: top - bot, sz: it.horiz ? th : len,
                color: new THREE.Color(v * r.range(.96, 1.03), v, v * r.range(.92, 1.0)),
              });
              /* 压顶石 */
              if (r.chance(.24)) {
                const p2 = toWorld(it, mid, side * (it.w / 2 + .02));
                const v2 = r.range(.74, 1.12);
                const len2 = sl * 1.22, th2 = th + .18;
                revetItems.push({
                  x: p2.x, y: top + .07, z: p2.z,
                  ry: (it.horiz ? 0 : Math.PI / 2) + r.range(-.05, .05),
                  sx: it.horiz ? len2 : th2, sy: .15, sz: it.horiz ? th2 : len2,
                  color: new THREE.Color(v2, v2 * r.range(.98, 1.02), v2 * r.range(.9, .99)),
                });
              }
            }
            a += sl * r.range(.85, 1.0);
          }
          /* 岸后土坡：从驳岸顶接到地面 */
          const innerC = side * (it.w / 2 + .2);
          const innerY = (a) => .11 + .035 * Math.sin(a * .9);
          const outerC = side * (it.w / 2 + 1.3);
          dirtParts.push(bankStrip(it, side, seg.a0, seg.a1, innerC, innerY, outerC, () => .02, 10));
          grassAlong(it, seg.a0, seg.a1, innerC, innerY, outerC, () => .02, grassItems, r, side, blocked);
        } else {
          /* 自然土岸：从水面直接爬上岸 */
          const innerC = side * (it.w / 2 - .04);
          const innerY = () => -.14;
          const outerC = side * (it.w / 2 + 1.15);
          dirtParts.push(bankStrip(it, side, seg.a0, seg.a1, innerC, innerY, outerC, () => .02, 12));
          grassAlong(it, seg.a0, seg.a1, innerC, innerY, outerC, () => .02, grassItems, r, side, blocked);
        }
      }
    }

    /* ═══ 3. 河埠头 ═══════════════════════════════════════ */
    const nWharf = r.int(2, 4);
    for (let i = 0; i < nWharf; i++) {
      const a = r.range(a0 + 6, a1 - 6);
      if (a <= a0 || a >= a1) continue;
      if (blocked(it, a)) continue;
      const side = r.chance(.5) ? 1 : -1;
      const edge = it.w / 2;
      /* 埠头平台（长边顺河） */
      const pc = side * (edge - .7);
      const pp = toWorld(it, a, pc);
      stoneParts.push(bankBox(it, 2.3, .82, 1.35, pp.x, .04 - .41, pp.z));
      /* 台阶：三级下水 */
      for (let k = 0; k < 3; k++) {
        const c = side * (edge - 1.35 - .45 * (k + .5));
        const top = .04 - .24 * (k + 1);
        const p = toWorld(it, a + r.range(-.1, .1), c);
        stoneParts.push(bankBox(it, 1.9, top + .9, .45, p.x, (top - .9) / 2, p.z));
      }
      /* 埠头旁两棵草 */
      const g = toWorld(it, a + 1.6, side * (edge + .55));
      grassItems.push({ x: g.x, y: .01, z: g.z, ry: r.range(0, 6.28), sx: r.range(.8, 1.3), sy: r.range(.6, 1.1), sz: 1 });
    }
  }

  /* ═══ 4. 桥 ═════════════════════════════════════════════ */
  for (const spot of bridgeSpots) {
    buildBridge(spot.it, spot.along, stoneParts, postItems);
  }

  /* ═══ 5. 组装 ═══════════════════════════════════════════ */
  if (waterParts.length) {
    const g = mergeGeometries(waterParts.map(nonIndexed), false);
    const m = new THREE.Mesh(g, MAT.water);
    m.name = 'water-surface';
    m.receiveShadow = true;
    m.renderOrder = 1;
    group.add(m);
  }
  if (revetItems.length) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = instanced(g, MAT.stone, revetItems, true);
    m.name = 'bank-stones';
    group.add(m);
  }
  if (dirtParts.length) {
    const g = mergeGeometries(dirtParts.map(nonIndexed), false);
    const m = new THREE.Mesh(g, MAT.dirt);
    m.name = 'bank-earth';
    m.receiveShadow = true;
    group.add(m);
  }
  if (grassItems.length) {
    const g = grassGeo();
    const m = instanced(g, MAT.leaf, grassItems, false);
    m.name = 'bank-grass';
    m.castShadow = false;
    group.add(m);
  }
  if (stoneParts.length) {
    const g = mergeGeometries(stoneParts.map(nonIndexed), false);
    const m = new THREE.Mesh(g, MAT.stone);
    m.name = 'bridge-stone';
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  if (postItems.length) {
    const g = postGeo();
    const m = instanced(g, MAT.stoneDark, postItems, false);
    m.name = 'bridge-posts';
    group.add(m);
  }

  /* ═══ 6. 动画：滚水面法线 ═══════════════════════════════ */
  group.userData.update = (t) => {
    const nm = MAT.water && MAT.water.normalMap;
    if (!nm) return;
    nm.offset.set(t * 0.035, t * 0.021);
  };
  group.userData.waterY = WATER_Y;
  group.userData.bridgeCrown = BRIDGE_CROWN;
  group.userData.roadY = ROAD_Y;
  group.userData.riverCount = info.length;
  group.userData.bridgeCount = bridgeSpots.length;

  return group;
}

/* 岸上的石构件：长边顺着河走（横河长轴 X，纵河长轴 Z） */
function bankBox(it, alongLen, h, crossLen, wx, wy, wz) {
  return it.horiz
    ? boxGeo(alongLen, h, crossLen, wx, wy, wz)
    : boxGeo(crossLen, h, alongLen, wx, wy, wz);
}

/* ── 岸坡条带：内沿（水侧）→ 外沿（地面）─────────────────── */
function bankStrip(it, side, a0, a1, innerC, innerYFn, outerC, outerYFn, samples) {
  const pos = [];
  const quad = (a, b, c, d) => {
    pos.push(...a, ...b, ...c);
    pos.push(...a, ...c, ...d);
  };
  for (let i = 0; i < samples; i++) {
    const t0 = i / samples, t1 = (i + 1) / samples;
    const aA = a0 + (a1 - a0) * t0, aB = a0 + (a1 - a0) * t1;
    /* 外沿做点起伏，别是一条直的斜面 */
    const wob = (a) => 1 + .12 * Math.sin(a * 1.7) + .08 * Math.sin(a * .53 + 1.2);
    const oA = Math.abs(outerC) * wob(aA), oB = Math.abs(outerC) * wob(aB);
    const pI0 = toWorld(it, aA, innerC), pO0 = toWorld(it, aA, side * oA);
    const pI1 = toWorld(it, aB, innerC), pO1 = toWorld(it, aB, side * oB);
    const i0 = [pI0.x, innerYFn(aA), pI0.z], o0 = [pO0.x, outerYFn(aA), pO0.z];
    const i1 = [pI1.x, innerYFn(aB), pI1.z], o1 = [pO1.x, outerYFn(aB), pO1.z];
    /* 缠绕方向随河向走：横河沿 X、纵河沿 Z，手性相反 */
    if (it.horiz ? side > 0 : side < 0) quad(i0, o0, o1, i1);
    else quad(i0, i1, o1, o0);
  }
  return geoFromPos(pos);
}

/* 沿岸撒草丛 */
function grassAlong(it, a0, a1, innerC, innerYFn, outerC, outerYFn, out, r, side, isBlocked) {
  const step = r.range(1.1, 2.1);
  for (let a = a0 + r.range(0, step); a < a1; a += step * r.range(.7, 1.5)) {
    if (isBlocked(it, a)) continue;
    if (!r.chance(.62)) continue;
    const k = r.range(.06, .95);
    const cIn = innerC, cOut = side * Math.abs(outerC);
    const c = cIn + (cOut - cIn) * k;
    const yIn = innerYFn(a), yOut = outerYFn(a);
    const y = yIn + (yOut - yIn) * k;
    const p = toWorld(it, a, c);
    out.push({
      x: p.x, y: Math.max(y, 0), z: p.z,
      ry: r.range(0, 6.283), sx: r.range(.7, 1.4), sy: r.range(.6, 1.35), sz: 1,
    });
  }
}

/* 草丛几何：3 片交叉面 */
function grassGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(.2, .58);
    g.translate(0, .29, 0);
    g.rotateY(i * Math.PI / 3);
    parts.push(nonIndexed(g));
  }
  return mergeGeometries(parts, false);
}

/* 望柱几何：柱身 + 柱头 + 顶珠（高 1，底在 y=0） */
function postGeo() {
  const shaft = new THREE.BoxGeometry(.15, .80, .15); shaft.translate(0, .40, 0);
  const cap = new THREE.BoxGeometry(.24, .11, .24); cap.translate(0, .855, 0);
  const top = new THREE.BoxGeometry(.19, .09, .19); top.translate(0, .955, 0);
  return mergeGeometries([shaft, cap, top].map(nonIndexed), false);
}

/* ── 拱形石桥 ──────────────────────────────────────────────
   局部坐标：X = 跨河方向（span），Z = 顺河方向（桥宽），Y 向上。
   跨度方向永远垂直于河（横河 → 桥转 90°）。                */
function buildBridge(it, alongPos, stoneParts, postItems) {
  const rv = it.rv;
  const L = rv.w + 5.0;               // 桥全长（含两端引桥）
  const Wb = BRIDGE_W;
  const half = L / 2;
  const yTop = (u) => ROAD_Y + BRIDGE_RISE * (1 - (u / half) * (u / half));
  const soffit = (u) => yTop(u) - DECK_TH;

  const nSpans = rv.w > 9 ? 3 : 2;    // 河宽就多一跨
  const pierW = 0.9, abut = 2.3;
  const clear = (L - 2 * abut - (nSpans - 1) * pierW) / nSpans;
  const spans = [];
  for (let i = 0; i < nSpans; i++) {
    const u0 = -half + abut + i * (clear + pierW);
    spans.push({ u0, u1: u0 + clear, c: u0 + clear / 2 });
  }
  const crownOf = (sp) => Math.min(0.42, soffit(sp.c) - 0.10);
  const intrados = (u) => {
    for (const sp of spans) {
      if (u >= sp.u0 - 1e-6 && u <= sp.u1 + 1e-6) {
        const t = (u - sp.c) / (clear / 2);
        return -0.30 + (crownOf(sp) + 0.30) * (1 - t * t);
      }
    }
    return -0.85;
  };

  /* 站点：拱腹 / 桥墩 / 引桥 */
  const body = [];
  body.push({ u: -half, top: soffit(-half), bot: -0.85 });
  body.push({ u: -half + abut, top: soffit(-half + abut), bot: -0.85 });
  spans.forEach((sp, i) => {
    const N = 18;
    for (let k = 0; k <= N; k++) {
      const u = sp.u0 + (sp.u1 - sp.u0) * k / N;
      body.push({ u, top: soffit(u), bot: intrados(u) });
    }
    body.push({ u: sp.u1, top: soffit(sp.u1), bot: -0.85 });          // 墩面
    if (i < spans.length - 1) {
      const nx = spans[i + 1];
      body.push({ u: nx.u0, top: soffit(nx.u0), bot: -0.85 });        // 墩身
      body.push({ u: nx.u0, top: soffit(nx.u0), bot: intrados(nx.u0) });// 起拱面
    }
  });
  body.push({ u: half, top: soffit(half), bot: -0.85 });

  /* 桥面板（拱起的路面） */
  const deck = [];
  const DN = 42;
  for (let k = 0; k <= DN; k++) {
    const u = -half + L * k / DN;
    deck.push({ u, top: yTop(u), bot: soffit(u) });
  }

  const parts = [];
  parts.push(loftSolid(body, -Wb / 2, Wb / 2));
  parts.push(loftSolid(deck, -Wb / 2, Wb / 2));

  /* 石栏杆：栏板 + 压顶条 + 望柱 */
  const localPosts = [];
  for (const side of [-1, 1]) {
    const panel = [], cope = [];
    for (let k = 0; k <= DN; k++) {
      const u = -half + L * k / DN;
      panel.push({ u, top: yTop(u) + 0.30, bot: yTop(u) + 0.02 });
      cope.push({ u, top: yTop(u) + 0.39, bot: yTop(u) + 0.28 });
    }
    const zA = side * (Wb / 2 - 0.17), zB = side * (Wb / 2 - 0.04);
    parts.push(loftSolid(panel, Math.min(zA, zB), Math.max(zA, zB)));
    parts.push(loftSolid(cope, Math.min(zA, zB) - 0.02, Math.max(zA, zB) + 0.02));
    const n = Math.max(5, Math.round(L / 0.85));
    for (let k = 0; k <= n; k++) {
      const u = -half + L * k / n;
      localPosts.push({ u, y: yTop(u), z: side * (Wb / 2 - 0.10) });
    }
  }

  /* 桥墩分水尖 */
  for (let i = 0; i < spans.length - 1; i++) {
    const pu = spans[i].u1 + pierW / 2;
    parts.push(wedgeGeo(pierW * 0.92, 0.85, -Wb / 2, -0.95, soffit(pu) - 0.06));
  }

  /* 摆到世界里：横河的桥转 90°，保证跨度方向垂直于河 */
  const rot = it.horiz ? -Math.PI / 2 : 0;
  const m = new THREE.Matrix4().makeRotationY(rot);
  m.setPosition(it.horiz ? alongPos : it.center, 0, it.horiz ? it.center : alongPos);
  for (const p of parts) { p.applyMatrix4(m); stoneParts.push(p); }
  for (const p of localPosts) {
    const v = new THREE.Vector3(p.u, p.y, p.z).applyMatrix4(m);
    postItems.push({ x: v.x, y: v.y, z: v.z, ry: 0, sx: 1, sy: 0.62, sz: 1 });
  }
}
