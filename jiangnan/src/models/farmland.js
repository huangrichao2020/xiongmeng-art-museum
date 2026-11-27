/* 江南古村 · 农田模块（paddy 水田 / dry 旱地 / tea 茶园 / veg 菜地）
   ------------------------------------------------------------------
   契约：
     · 纯函数：只吃 layout，不读全局，不用 Math.random。
       随机源 = makeRng(layout.seed ^ 0x33)，按固定次序消费。
     · 坐标：田块占 gx/gz/w/h 格，格边长 layout.cell。
       田面高度 y = SURF_Y(0.02)，田面必须平整（不做起伏）。
     · 材质取自 core/materials.js；秧苗/茶苗/菜苗/土垄一律 InstancedMesh，
       田埂按材质合并。全模块 draw call 控制在 25 以内。

   田块重叠的处理：
     布局层允许两块田占同一格（core/layout.js 的 canField 没排除 TYPE.FIELD），
     直接按矩形画会出现面 z-fighting、埂叠成双层。这里用「格归属表」解决：
     按面积从小到大让小块优先占地，每格只属于一块田；
     田面按归属格逐格铺（不越界到邻田/房子），田埂按「格边界」生成：
       · 边界外侧是另一块田 → 共享埂，骑在两田交界线上，只生成一条（宽 0.35m）
       · 边界外侧不是田      → 独埂，压在自己田块内侧（绝不越到别田/房子上）
     同一格归属唯一 → 不会有两层埂叠在一起，也不会互相穿面。 */
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { MAT, initMaterials } from '../core/materials.js';
import { mergeGeometries, meshOf } from '../core/geo.js';

/* ── 参数（米） ─────────────────────────────────────── */
const SURF_Y = 0.02;        // 田面高度：比地面高一点，避免 z-fighting
const BUND_W = 0.35;        // 田埂宽
const BUND_H = 0.16;        // 田埂高出田面
const BUND_BASE = -0.08;    // 埂底埋进地里（不悬空）
const BUND_TOP = SURF_Y + BUND_H;
const WATER_Y = SURF_Y + 0.05;   // 浅水面
const WATER_MARGIN = 0.25;        // 水面离埂内沿留出泥岸
const RIDGE_STEP = 0.60;    // 旱地土垄间距
const RIDGE_W = 0.36;       // 土垄宽
const RIDGE_H = 0.09;       // 土垄高
const SPROUT_STEP = 0.80;   // 垄上菜苗间距
const TEA_ROW_STEP = 1.10;  // 茶行行距
const TEA_PLANT_STEP = 0.55;// 茶行株距
const TEA_PATH_W = 0.46;    // 行间土路宽
const RICE_STEP = 0.45;     // 秧苗株距
const VEG_FURROW = 0.35;    // 畦沟宽
const VEG_BED_H = 0.12;     // 畦高
const VEG_PLANT_STEP = 0.50;// 菜苗株距
/* 植株半径：出界容差。宁可苗少一点，也不许越界压到邻田/房子/路上 */
const TEA_CLEAR = 0.40;     // 茶球半径 ~0.35
const VEG_CLEAR = 0.22;     // 菜苗半径 ~0.18
const RICE_CLEAR = 0.12;    // 秧苗半径 ~0.05

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
function boxXZ(cx, cz, w, d, y0, y1, cell) {
  const g = new THREE.BoxGeometry(Math.max(w, 0.0008), Math.max(y1 - y0, 0.0008), Math.max(d, 0.0008));
  g.translate(cx, (y0 + y1) / 2, cz);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / cell, uv.getY(i) * d / cell);
  uv.needsUpdate = true;
  return g;
}
/** 草丛：几片交叉的小叶片 */
function tuftGeo(w, h, planes) {
  const parts = [];
  for (let i = 0; i < planes; i++) {
    const p = new THREE.PlaneGeometry(w, h, 1, 1);
    p.translate(0, h / 2, 0);
    p.rotateY((i / planes) * Math.PI + 0.25);
    parts.push(p);
  }
  return mergeGeometries(parts, false);
}
/** InstancedMesh 装配（支持逐实例颜色） */
function makeInstanced(geo, mat, items) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const d = new THREE.Object3D();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    d.position.set(it.x, it.y, it.z);
    d.rotation.set(0, it.ry || 0, 0);
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

  /* 世界坐标：格线 = origin + g*cell（与 layout 的 x/z 约定一致，两种写法都兼容） */
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

  /* ── 材质（只用共享调色板，克隆只为改透明度/色相/顶点色） ── */
  const matDirt = MAT.dirt;
  const matPaddy = MAT.paddy;
  const matGround = MAT.ground;
  const matRice = MAT.leaf.clone(); matRice.color.setHex(0xffffff);
  const matSprout = MAT.leaf.clone(); matSprout.color.setHex(0xffffff);
  const matTea = MAT.leaf.clone(); matTea.color.setHex(0xffffff);
  const matVegBed = MAT.leaf.clone(); matVegBed.color.setHex(0xffffff); matVegBed.vertexColors = true;
  const matVegPlant = MAT.leaf.clone(); matVegPlant.color.setHex(0xffffff);
  const matWater = MAT.paddyWet.clone();
  matWater.transparent = true; matWater.opacity = 0.42; matWater.depthWrite = false;
  matWater.roughness = 0.18; matWater.metalness = 0.24;
  const matSheen = MAT.paddyWet.clone();
  matSheen.transparent = true; matSheen.opacity = 0.40; matSheen.depthWrite = false;
  matSheen.color.setHex(0xbcd8cf); matSheen.roughness = 0.06; matSheen.metalness = 0.5;
  matSheen.emissive = new THREE.Color(0x2f5f55); matSheen.emissiveIntensity = 0.18;
  const matRidge = MAT.dirt.clone(); matRidge.color.setHex(0xd8c39c);
  const matCloth = MAT.paper.clone();
  matCloth.color.setHex(0xb6c2cb); matCloth.emissive = new THREE.Color(0x000000); matCloth.emissiveIntensity = 0;

  /* ── 收集桶 ── */
  const gDirt = [];       // 田埂 + 旱地/菜地土面 + 茶行土路（MAT.dirt，1 draw call）
  const gMud = [];        // 水田泥面
  const gWater = [];      // 浅水层
  const gSheen = [];      // 水面反光条
  const gGround = [];     // 茶园地表
  const gVegBed = [];     // 菜畦绿面（顶点色，每畦深浅不同）
  const iRice = [], iRidge = [], iSprout = [], iTea = [], iVeg = [];
  const scPole = [], scHat = [], scCloth = [];
  const bundSeen = new Set();
  let sharedBunds = 0, ownBunds = 0;

  /* 某格四边的埂内缩量：0=同田内部，SH=与邻田共享(半宽)，OW=独埂(全宽) */
  function insets(gx, gz, fi) {
    const side = v => (v === fi) ? 0 : (v >= 0 ? BUND_W / 2 : BUND_W);
    return [side(own(gx - 1, gz)), side(own(gx + 1, gz)), side(own(gx, gz - 1)), side(own(gx, gz + 1))];
  }

  /* ── 逐块田 ── */
  for (let fi = 0; fi < fields.length; fi++) {
    const f = fields[fi];
    const kind = (f.kind === 'paddy' || f.kind === 'dry' || f.kind === 'tea' || f.kind === 'veg') ? f.kind : 'dry';
    kindCount[kind]++;

    /* 这块田实际拥有的格 */
    const cells = [];
    for (let z = f.gz; z < f.gz + f.h; z++)
      for (let x = f.gx; x < f.gx + f.w; x++)
        if (own(x, z) === fi) cells.push([x, z]);
    if (!cells.length) continue;               // 完全被别的田压住 → 不画

    /* 田块本地坐标（左上角世界坐标） */
    const fx0 = f.x - f.w * cell / 2, fz0 = f.z - f.h * cell / 2;
    const fx1 = fx0 + f.w * cell, fz1 = fz0 + f.h * cell;
    const alongX = (f.w * cell) >= (f.h * cell);   // 长边方向

    /* 连续格段：沿 X 的行段 / 沿 Z 的列段（用来放垄、茶行、菜畦） */
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
      /* 西边 */
      let nb = own(cx - 1, cz);
      if (nb !== fi) {
        const key = 'V|' + cx + '|' + cz;
        if (!bundSeen.has(key)) {
          bundSeen.add(key);
          if (nb >= 0) { sharedBunds++; gDirt.push(boxXZ(x0, (z0 + z1) / 2, BUND_W, cell, BUND_BASE, BUND_TOP, cell)); }
          else { ownBunds++; gDirt.push(boxXZ(x0 + BUND_W / 2, (z0 + z1) / 2, BUND_W, cell, BUND_BASE, BUND_TOP, cell)); }
        }
      }
      /* 东边 */
      nb = own(cx + 1, cz);
      if (nb !== fi) {
        const key = 'V|' + (cx + 1) + '|' + cz;
        if (!bundSeen.has(key)) {
          bundSeen.add(key);
          if (nb >= 0) { sharedBunds++; gDirt.push(boxXZ(x1, (z0 + z1) / 2, BUND_W, cell, BUND_BASE, BUND_TOP, cell)); }
          else { ownBunds++; gDirt.push(boxXZ(x1 - BUND_W / 2, (z0 + z1) / 2, BUND_W, cell, BUND_BASE, BUND_TOP, cell)); }
        }
      }
      /* 北边 */
      nb = own(cx, cz - 1);
      if (nb !== fi) {
        const key = 'H|' + cx + '|' + cz;
        if (!bundSeen.has(key)) {
          bundSeen.add(key);
          if (nb >= 0) { sharedBunds++; gDirt.push(boxXZ((x0 + x1) / 2, z0, cell, BUND_W, BUND_BASE, BUND_TOP, cell)); }
          else { ownBunds++; gDirt.push(boxXZ((x0 + x1) / 2, z0 + BUND_W / 2, cell, BUND_W, BUND_BASE, BUND_TOP, cell)); }
        }
      }
      /* 南边 */
      nb = own(cx, cz + 1);
      if (nb !== fi) {
        const key = 'H|' + cx + '|' + (cz + 1);
        if (!bundSeen.has(key)) {
          bundSeen.add(key);
          if (nb >= 0) { sharedBunds++; gDirt.push(boxXZ((x0 + x1) / 2, z1, cell, BUND_W, BUND_BASE, BUND_TOP, cell)); }
          else { ownBunds++; gDirt.push(boxXZ((x0 + x1) / 2, z1 - BUND_W / 2, cell, BUND_W, BUND_BASE, BUND_TOP, cell)); }
        }
      }
    }

    /* ── 田面 ── */
    for (const [cx, cz] of cells) {
      const x0 = GX(cx), x1 = GX(cx + 1), z0 = GZ(cz), z1 = GZ(cz + 1);
      const [iw, ie, inn, is] = insets(cx, cz, fi);

      if (kind === 'paddy') {
        /* 泥面（田面基准 y = 0.02，平整） */
        gMud.push(quadXZ(x0, z0, x1, z1, SURF_Y, cell));
        /* 浅水层：只在有埂的边上留出泥岸，埂之间水面连成一片 */
        const wx0 = x0 + (iw > 0 ? iw + WATER_MARGIN : 0);
        const wx1 = x1 - (ie > 0 ? ie + WATER_MARGIN : 0);
        const wz0 = z0 + (inn > 0 ? inn + WATER_MARGIN : 0);
        const wz1 = z1 - (is > 0 ? is + WATER_MARGIN : 0);
        if (wx1 > wx0 + 0.05 && wz1 > wz0 + 0.05) gWater.push(quadXZ(wx0, wz0, wx1, wz1, WATER_Y, cell));
      } else if (kind === 'tea') {
        gGround.push(quadXZ(x0, z0, x1, z1, SURF_Y, cell));
      } else {
        gDirt.push(quadXZ(x0, z0, x1, z1, SURF_Y, cell));
      }
    }

    /* 统一的「沿长边铺一排东西」工具：
       along = 'x' 表示东西沿 X 方向排，cross = Z；反之亦然。
       每个 run 给出：沿向区间 [a0,a1]、横向区间 [b0,b1]（一格宽）。 */
    const axis = alongX ? 'x' : 'z';
    const runs = alongX ? rowRuns : colRuns;
    const crossOrigin = alongX ? fz0 : fx0;
    const alongOrigin = alongX ? fx0 : fz0;
    const crossLen = alongX ? (fz1 - fz0) : (fx1 - fx0);
    const alongLen = alongX ? (fx1 - fx0) : (fz1 - fz0);
    /** 把 (沿向位置, 横向位置) 变成世界 x/z */
    const world = (along, cross) => (axis === 'x' ? { x: along, z: cross } : { x: cross, z: along });
    const runGeom = run => (axis === 'x'
      ? { a0: GX(run.x0), a1: GX(run.x1), b0: GZ(run.z), b1: GZ(run.z + 1) }
      : { a0: GZ(run.z0), a1: GZ(run.z1), b0: GX(run.x), b1: GX(run.x + 1) });

    /* 秧苗：按水田行列插秧（只在有水的范围内） */
    if (kind === 'paddy') {
      for (const [cx, cz] of cells) {
        const [iw, ie, inn, is] = insets(cx, cz, fi);
        const x0 = GX(cx) + iw + WATER_MARGIN, x1 = GX(cx + 1) - ie - WATER_MARGIN;
        const z0 = GZ(cz) + inn + WATER_MARGIN, z1 = GZ(cz + 1) - is - WATER_MARGIN;
        if (x1 <= x0 || z1 <= z0) continue;
        const jx = (fx0 - x0) % RICE_STEP, jz = (fz0 - z0) % RICE_STEP;
        for (let x = x0 + jx; x < x1 - RICE_CLEAR; x += RICE_STEP)
          for (let z = z0 + jz; z < z1 - RICE_CLEAR; z += RICE_STEP) {
            if (r() < 0.14) continue;                       // 缺苗
            const s = r.range(0.82, 1.22);
            iRice.push({
              x: x + r.range(-0.05, 0.05), y: SURF_Y, z: z + r.range(-0.05, 0.05),
              ry: r.range(0, Math.PI * 2), sx: s, sy: r.range(0.85, 1.35), sz: s,
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
      /* 稻草人：站在自己田里（脚落在泥面，不悬空、不越界） */
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

    /* 旱地：一垄一垄的翻耕土垄 + 垄上零星菜苗 */
    else if (kind === 'dry') {
      const nRidge = Math.max(1, Math.floor(crossLen / RIDGE_STEP));
      const startCross = crossOrigin + (crossLen - nRidge * RIDGE_STEP) / 2 + RIDGE_STEP / 2;
      for (const run of runs) {
        const { a0, a1, b0, b1 } = runGeom(run);
        for (let k = 0; k < nRidge; k++) {
          const c = startCross + k * RIDGE_STEP;
          const c0 = Math.max(c - RIDGE_W / 2, b0), c1 = Math.min(c + RIDGE_W / 2, b1);
          if (c1 - c0 < 0.04) continue;
          const cc = (c0 + c1) / 2;
          const ac = (a0 + a1) / 2;
          const wp = world(ac, cc);
          const v = r.range(0.86, 1.14);
          iRidge.push({
            x: wp.x, y: SURF_Y + RIDGE_H / 2, z: wp.z,
            ry: axis === 'x' ? 0 : Math.PI / 2,
            sx: a1 - a0, sy: RIDGE_H, sz: c1 - c0,
            c: new THREE.Color(v, v * 0.99, v * 0.93),
          });
          /* 垄上零星菜苗（沿垄方向，间隔 0.8m） */
          const n = Math.floor((a1 - a0) / SPROUT_STEP);
          for (let s = 0; s < n; s++) {
            if (r() < 0.42) continue;
            const t = a0 + (s + 0.5) * ((a1 - a0) / Math.max(n, 1));
            const sp = world(t, cc + r.range(-0.05, 0.05));
            iSprout.push({
              x: sp.x, y: SURF_Y + RIDGE_H, z: sp.z,
              ry: r.range(0, Math.PI * 2), sx: r.range(0.85, 1.25), sy: r.range(0.8, 1.3),
            });
          }
        }
      }
    }

    /* 茶园：整齐的茶行 + 行间土路 */
    else if (kind === 'tea') {
      const nRow = Math.max(1, Math.floor(crossLen / TEA_ROW_STEP));
      const startCross = crossOrigin + (crossLen - nRow * TEA_ROW_STEP) / 2 + TEA_ROW_STEP / 2;
      for (const run of runs) {
        const { a0, a1, b0, b1 } = runGeom(run);
        /* 茶行：行距 1.1m，行内株距 0.55m */
        for (let k = 0; k < nRow; k++) {
          const c = startCross + k * TEA_ROW_STEP;
          /* 行心必须离田边（留出茶球半径），否则茶球会探到邻田/房子上 */
          if (c < b0 + TEA_CLEAR || c > b1 - TEA_CLEAR) continue;
          /* 沿全局网格对齐，跨格不乱 */
          const first = a0 + ((alongOrigin - a0) % TEA_PLANT_STEP + TEA_PLANT_STEP) % TEA_PLANT_STEP;
          for (let t = first; t < a1 - TEA_CLEAR; t += TEA_PLANT_STEP) {
            const sc = r.range(0.84, 1.18), cc = r.range(0.86, 1.14);
            const wp = world(t, c);
            iTea.push({
              x: wp.x, y: SURF_Y, z: wp.z,
              ry: r.range(0, Math.PI * 2), sx: sc, sy: r.range(0.9, 1.12), sz: sc,
              c: new THREE.Color(cc * 0.94, cc, cc * 0.88),
            });
          }
        }
        /* 行间土路 */
        for (let k = 0; k <= nRow; k++) {
          const c = startCross - TEA_ROW_STEP / 2 + k * TEA_ROW_STEP;
          const c0 = Math.max(c - TEA_PATH_W / 2, b0), c1 = Math.min(c + TEA_PATH_W / 2, b1);
          if (c1 - c0 < 0.06) continue;
          const q = axis === 'x'
            ? quadXZ(a0, c0, a1, c1, SURF_Y + 0.008, cell)
            : quadXZ(c0, a0, c1, a1, SURF_Y + 0.008, cell);
          gDirt.push(q);
        }
      }
    }

    /* 菜地：3~4 小畦，每畦深浅不同的绿 + 畦沟 */
    else {
      let nBed = 4, bedLen = 0;
      for (let n = 4; n >= 3; n--) {
        bedLen = (crossLen - VEG_FURROW * (n + 1)) / n;
        if (bedLen >= 1.1) { nBed = n; break; }
      }
      const shades = [
        [0.82, 1.00, 0.55], [0.58, 0.86, 0.40], [1.00, 0.96, 0.62],
        [0.46, 0.76, 0.34], [0.90, 1.05, 0.70], [0.70, 0.94, 0.50],
      ];
      /* 畦带：按田块全局切，跨格对齐 */
      const bands = [];
      for (let k = 0; k < nBed; k++) {
        const c0 = crossOrigin + VEG_FURROW + k * (bedLen + VEG_FURROW);
        bands.push({ c0, c1: c0 + bedLen, k });
      }
      for (const run of runs) {
        const { a0, a1, b0, b1 } = runGeom(run);
        for (const bed of bands) {
          const c0 = Math.max(bed.c0, b0), c1 = Math.min(bed.c1, b1);
          if (c1 - c0 < 0.3) continue;
          /* 畦土（侧面，埋进土面一点，避免共面闪烁） */
          const wp = world((a0 + a1) / 2, (c0 + c1) / 2);
          const sx = axis === 'x' ? (a1 - a0) : (c1 - c0);
          const sz = axis === 'x' ? (c1 - c0) : (a1 - a0);
          gDirt.push(boxXZ(wp.x, wp.z, sx, sz, SURF_Y - 0.02, SURF_Y + VEG_BED_H, cell));
          /* 畦面绿（每畦不同深浅） */
          const rgb = shades[bed.k % shades.length];
          const y = SURF_Y + VEG_BED_H + 0.004;
          const q = axis === 'x'
            ? quadXZColor(a0, c0, a1, c1, y, cell, rgb)
            : quadXZColor(c0, a0, c1, a1, y, cell, rgb);
          gVegBed.push(q);
          /* 畦上菜苗：沿畦方向成行 */
          const nRowV = Math.max(1, Math.floor((c1 - c0) / 0.55));
          const first = a0 + ((alongOrigin - a0) % VEG_PLANT_STEP + VEG_PLANT_STEP) % VEG_PLANT_STEP;
          for (let v = 0; v < nRowV; v++) {
            const tv = c0 + (v + 0.5) * ((c1 - c0) / nRowV);
            if (tv < c0 + VEG_CLEAR || tv > c1 - VEG_CLEAR) continue;
            for (let t = first; t < a1 - VEG_CLEAR; t += VEG_PLANT_STEP) {
              const sc = r.range(0.85, 1.2), cc = r.range(0.82, 1.18);
              const p2 = world(t + r.range(-0.04, 0.04), tv);
              iVeg.push({
                x: p2.x, y: SURF_Y + VEG_BED_H, z: p2.z,
                ry: r.range(0, Math.PI * 2), sx: sc, sy: r.range(0.85, 1.15), sz: sc,
                c: new THREE.Color(cc * 0.95, cc * 1.05, cc * 0.8),
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

  if (gDirt.length) push(meshOf(gDirt, matDirt));
  if (gMud.length) push(meshOf(gMud, matPaddy));
  if (gGround.length) push(meshOf(gGround, matGround));
  if (gVegBed.length) push(meshOf(gVegBed, matVegBed));
  if (gWater.length) { const m = meshOf(gWater, matWater); m.renderOrder = 2; m.castShadow = false; push(m); }
  if (gSheen.length) { const m = meshOf(gSheen, matSheen); m.renderOrder = 3; m.castShadow = false; push(m); }

  /* 秧苗 / 菜苗 / 茶球 / 土垄 —— 全部 InstancedMesh */
  push(makeInstanced(tuftGeo(0.10, 0.30, 3), matRice, iRice));
  push(makeInstanced(tuftGeo(0.13, 0.20, 2), matSprout, iSprout));
  push(makeInstanced(new THREE.BoxGeometry(1, 1, 1), matRidge, iRidge));

  const bush = new THREE.IcosahedronGeometry(0.30, 1);
  bush.scale(1, 0.74, 1); bush.translate(0, 0.222, 0);
  push(makeInstanced(bush, matTea, iTea));

  const head = new THREE.SphereGeometry(0.15, 6, 4);
  head.scale(1, 0.78, 1); head.translate(0, 0.12, 0);
  const lf = new THREE.PlaneGeometry(0.26, 0.16); lf.rotateX(-Math.PI / 2.4); lf.translate(0, 0.08, 0);
  push(makeInstanced(mergeGeometries([head, lf], false), matVegPlant, iVeg));

  /* 稻草人 */
  if (scPole.length) push(meshOf(scPole, MAT.wood));
  if (scHat.length) push(meshOf(scHat, MAT.thatch));
  if (scCloth.length) push(meshOf(scCloth, matCloth));

  group.userData = {
    fields: kindCount,
    bunds: { shared: sharedBunds, own: ownBunds },
    instances: {
      rice: iRice.length, ridge: iRidge.length, sprout: iSprout.length,
      tea: iTea.length, veg: iVeg.length,
    },
    drawCalls,
  };
  return group;
}
