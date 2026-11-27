/* 江南古村 · 约束布局生成器
   ------------------------------------------------------------------
   所有硬约束都在这一层落地，模型模块只读结果：
     ① 河与路必正交            河/路都只走水平垂直直线段，交点必为直角
     ② 路近水锁直            贴着水 1 格内的路段不许拐弯
     ③ 房屋周围一圈禁止其他房屋   两栋房的占地外扩一圈不得相交
     ④ 房屋门朝道路            每栋房 rot 按最近道路方向算好
     ⑤ 农田必须近路/水/宅      每块农田外扩一圈内必须有路/水/宅
     ⑥ 宝塔距最近民居 ≥ 16 格
     ⑦ 主路两端 85% 立牌坊
     ⑧ 树在边缘、水边、树丛处加密
   ------------------------------------------------------------------ */
import { makeRng } from './rng.js';

export const TYPE = { WATER: 1, ROAD: 2, BRIDGE: 4, FIELD: 8, HOUSE: 16, TOWER: 32, PAIFANG: 64, EMPTY: 128 };

export const CELL = 3.2;      // 每格边长（米）
export const GW = 80, GH = 80; // 网格尺寸（格）→ 256m × 256m
/* 村子只长在中心这块，外圈留给竹林/山野，宝塔也蹲在那儿 ——
   这样「宝塔距最近民居 ≥ 16 格」才有地方放（16 格 ≈ 51m）。 */
export const CORE = 16;        // 中心区起始格（外圈 16 格 ≈ 51m 是林子与塔的地盘）
const EDGE_KEEP = 4;          // 地图最外圈留空，交给树丛

/* 朝向常量：门朝路的 rot */
const DIR_ROT = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };

const NAME_A = ['竹海', '水岸', '听雨', '暖山', '烟柳', '杏花', '青梅', '白鹭', '稻香', '枫溪'];
const NAME_B = ['茶山', '鸣市', '小筑', '渡口', '书巷', '樵径', '荷塘', '渔家', '云塬', '砚池'];
const NAME_C = ['江南百景图', '水乡聚落', '古村手记', '竹坞图', '溪畔小景'];

export function generateLayout(seed, opts = {}) {
  const rng = makeRng(seed);
  const W = opts.W || GW, H = opts.H || GH, cell = opts.cell || CELL;
  const N = W * H;
  /* 网格中心对齐世界原点（相机/太阳/阴影都按原点摆） */
  const originX = -W * cell / 2, originZ = -H * cell / 2;
  const wx = gx => originX + gx * cell;          // 格左边界的世界坐标
  const wz = gz => originZ + gz * cell;
  const wxc = gx => originX + (gx + .5) * cell; // 格中心的��界坐标
  const wzc = gz => originZ + (gz + .5) * cell;
  const type = new Uint8Array(N);
  const idx = (x, z) => z * W + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const isWater = (x, z) => inb(x, z) && (type[idx(x, z)] & TYPE.WATER);
  const isRoad = (x, z) => inb(x, z) && (type[idx(x, z)] & (TYPE.ROAD | TYPE.BRIDGE));
  const isHouse = (x, z) => inb(x, z) && (type[idx(x, z)] & TYPE.HOUSE);
  const isField = (x, z) => inb(x, z) && (type[idx(x, z)] & TYPE.FIELD);

  /* ── ① 河：只走水平或垂直的直线带，最多一主一支（支流与主河正交）── */
  const rivers = [];
  const riverRects = [];
  {
    const horiz = rng.chance(.72);
    const w = rng.int(5, 8);          // 主河 16~26m 宽 —— 江南水乡的河得能行船
    if (horiz) {
      const z0 = rng.int(Math.floor(H * .30), Math.floor(H * .62));
      riverRects.push({ horiz: true, z0, w });
    } else {
      const x0 = rng.int(Math.floor(W * .30), Math.floor(W * .62));
      riverRects.push({ horiz: false, x0, w });
    }
    /* 支流：与主河垂直，且不与主河平行 */
    if (rng.chance(.72)) {
      const w2 = rng.int(3, 5);
      if (horiz) {
        const x0 = rng.int(Math.floor(W * .18), Math.floor(W * .74));
        riverRects.push({ horiz: false, x0, w: w2 });
      } else {
        const z0 = rng.int(Math.floor(H * .18), Math.floor(H * .74));
        riverRects.push({ horiz: true, z0, w: w2 });
      }
    }
    for (const r of riverRects) {
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const hit = r.horiz ? (z >= r.z0 && z < r.z0 + r.w) : (x >= r.x0 && x < r.x0 + r.w);
        if (hit) type[idx(x, z)] |= TYPE.WATER;
      }
      if (r.horiz) { const zc = wzc(r.z0 + r.w / 2 - .5); rivers.push({ x1: wx(0), z1: zc, x2: wx(W), z2: zc, w: r.w * cell, horiz: true }); }
      else { const xc = wxc(r.x0 + r.w / 2 - .5); rivers.push({ x1: xc, z1: wz(0), x2: xc, z2: wz(H), w: r.w * cell, horiz: false }); }
    }
  }

  /* ── 路网：干道全直线（正交网），小径可拐弯但贴水必须锁直 ── */
  const roads = [];
  const bridges = [];
  const roadCells = [];
  const addRoad = (gx1, gz1, gx2, gz2, kind) => {
    if (gx1 !== gx2 && gz1 !== gz2) return;          // 只允许正交段
    const x1 = wx(gx1), z1 = wz(gz1), x2 = wx(gx2), z2 = wz(gz2);
    roads.push({ x1, z1, x2, z2, kind });
    const steps = Math.max(Math.abs(gx2 - gx1), Math.abs(gz2 - gz1));
    for (let i = 0; i <= steps; i++) {
      const gx = gx1 + Math.round((gx2 - gx1) * i / steps);
      const gz = gz1 + Math.round((gz2 - gz1) * i / steps);
      if (!inb(gx, gz)) continue;
      roadCells.push([gx, gz]);
      if (type[idx(gx, gz)] & TYPE.WATER) {
        type[idx(gx, gz)] = (type[idx(gx, gz)] & ~TYPE.WATER) | TYPE.BRIDGE;
        bridges.push({ gx, gz });
      } else type[idx(gx, gz)] |= TYPE.ROAD;
    }
  };
  {
    /* 主路：与主河垂直，横穿全村 */
    const mainVert = riverRects[0].horiz;      // 主河水平 → 主路竖直
    const span = (mainVert ? W : H);
    const mainPos = rng.int(CORE + 4, span - CORE - 5);
    if (mainVert) addRoad(mainPos, CORE, mainPos, H - CORE - 1, 'main');
    else addRoad(CORE, mainPos, W - CORE - 1, mainPos, 'main');
    /* 干道支线：与主路平行的几条 + 垂直的横街 */
    const parN = rng.int(2, 4);
    for (let i = 0; i < parN; i++) {
      const off = Math.round((mainPos + (i % 2 ? 1 : -1) * (1 + i) * rng.int(7, 12)) % (mainVert ? W : H));
      if (off < EDGE_KEEP + 2 || (mainVert ? off > W - EDGE_KEEP - 2 : off > H - EDGE_KEEP - 2)) continue;
      if (mainVert) addRoad(off, 0, off, H - 1, 'stone');
      else addRoad(0, off, W - 1, off, 'stone');
      /* 干道也允许伸到外圈，把竹林切开 */
    }
    const crossN = rng.int(2, 4);
    for (let i = 0; i < crossN; i++) {
      const off = Math.round((mainPos + (i % 2 ? 1 : -1) * (1 + i) * rng.int(9, 15)) % (mainVert ? H : W));
      if (off < EDGE_KEEP + 2 || (mainVert ? off > H - EDGE_KEEP - 2 : off > W - EDGE_KEEP - 2)) continue;
      if (mainVert) addRoad(0, off, W - 1, off, 'stone');
      else addRoad(off, 0, off, H - 1, 'stone');
    }
    /* 小径：允许拐弯，但贴水（1 格内）必须锁直 —— 规则 ② */
    let pathBudget = rng.int(10, 18);
    let guard = 0;
    while (pathBudget > 0 && guard++ < 220) {
      const sx = rng.int(EDGE_KEEP, W - EDGE_KEEP - 1), sz = rng.int(EDGE_KEEP, H - EDGE_KEEP - 1);
      if (isWater(sx, sz) || isRoad(sx, sz)) continue;
      let horiz = rng.chance(.5);
      let dir = rng.chance(.5) ? 1 : -1;          // 当前轴的走向
      let prevH = null, prevD = null;             // 上一段的方向（用于判断是不是转弯）
      let gx = sx, gz = sz;
      const segs = rng.int(2, 4);
      for (let s = 0; s < segs; s++) {
        const len = rng.int(3, 9);
        const nx = horiz ? gx + dir * len : gx;
        const nz = horiz ? gz : gz + dir * len;
        if (nx < EDGE_KEEP || nz < EDGE_KEEP || nx > W - EDGE_KEEP || nz > H - EDGE_KEEP) break;
        /* ② 这一段若贴着水（1 格内），就不许转弯 */
        let nearWater = false;
        for (let i = 0; i <= len; i++) {
          const tx = horiz ? gx + dir * i : gx;
          const tz = horiz ? gz : gz + dir * i;
          for (let dy = -1; dy <= 1 && !nearWater; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (isWater(tx + dx, tz + dy)) { nearWater = true; break; }
          }
        }
        const turned = (prevH !== null) && (prevH !== horiz || prevD !== dir);
        if (nearWater && turned) break;          // 贴水锁直：宁可不接这一段
        addRoad(gx, gz, nx, nz, 'dirt');
        prevH = horiz; prevD = dir;
        gx = nx; gz = nz;
        horiz = !horiz;
        dir = rng.chance(.5) ? 1 : -1;
      }
      pathBudget--;
    }
  }

  /* ── ③ 房屋：占地外扩一圈内不得有别的房 ── */
  const houses = [];
  const houseBuf = new Uint8Array(N);            // 房屋占位 + 外扩一圈
  const houseCells = [];
  const HW = 2, HD = 2;          // 每栋占 2×2 格（面宽两间 × 进深两间）
  const tryHouse = (gx, gz) => {
    if (gx < CORE || gz < CORE || gx + HW > W - CORE || gz + HD > H - CORE) return false;
    /* 占地本身不能是水/路/田 */
    for (let z = gz; z < gz + HD; z++) for (let x = gx; x < gx + HW; x++) {
      if (type[idx(x, z)] & (TYPE.WATER | TYPE.ROAD | TYPE.BRIDGE | TYPE.FIELD)) return false;
    }
    /* ④ 门朝路：正前方 1~3 格内必须有路 —— 门要正对街面，不许"斜着近就算" */
    let dir = null, bk = 99;
    for (const [nm, dx, dz] of [['E', 1, 0], ['W', -1, 0], ['S', 0, 1], ['N', 0, -1]]) {
      for (let k = 1; k <= 3; k++) {
        let hit = false;
        if (dx > 0) { for (let z = gz; z < gz + HD; z++) if (isRoad(gx + HW + k - 1, z)) hit = true; }
        else if (dx < 0) { for (let z = gz; z < gz + HD; z++) if (isRoad(gx - k, z)) hit = true; }
        else if (dz > 0) { for (let x = gx; x < gx + HW; x++) if (isRoad(x, gz + HD + k - 1)) hit = true; }
        else { for (let x = gx; x < gx + HW; x++) if (isRoad(x, gz - k)) hit = true; }
        if (hit) { if (k < bk) { bk = k; dir = nm; } break; }
      }
    }
    if (!dir) return false;
    /* ③ 外扩一圈禁止其他房屋 */
    for (let z = gz - 1; z <= gz + HD; z++) for (let x = gx - 1; x <= gx + HW; x++) {
      if (!inb(x, z)) return false;
      if (houseBuf[idx(x, z)]) return false;
    }
    for (let z = gz - 1; z <= gz + HD; z++) for (let x = gx - 1; x <= gx + HW; x++) {
      if (inb(x, z)) houseBuf[idx(x, z)] = 1;
    }
    for (let z = gz; z < gz + HD; z++) for (let x = gx; x < gx + HW; x++) {
      type[idx(x, z)] |= TYPE.HOUSE; houseCells.push([x, z]);
    }
    const kind = rng.chance(.14) ? 'rich' : rng.chance(.12) ? 'granary' : rng.chance(.08) ? 'shrine' : 'common';
    houses.push({
      gx, gz, w: HW, d: HD, kind, style: rng.int(0, 3),
      x: wxc(gx + (HW - 1) / 2), z: wzc(gz + (HD - 1) / 2),
      rot: DIR_ROT[dir], door: dir,
      floors: kind === 'rich' ? 2 : (rng.chance(.3) ? 2 : 1)
    });
    return true;
  };
  {
    /* 沿路两侧盖房子：拿路格挨个试（贴着路才盖得住） */
    const target = rng.int(58, 78);
    const roadIdx = rng.shuffle(roadCells.slice());
    /* 房要紧贴街面：门那侧的第一格就是路（门直接开在街上，江南临街民居的样子） */
    const cand = [[-HW, -1], [1, -1], [-1, -HD], [-1, 1]];
    let guard = 0;
    while (houses.length < target && guard++ < 6000 && roadIdx.length) {
      const rc = roadIdx[guard % roadIdx.length];
      for (const oi of rng.shuffle([0, 1, 2, 3])) {
        const c = cand[oi];
        if (tryHouse(rc[0] + c[0], rc[1] + c[1])) break;
      }
    }
    /* 补齐：沿主路随机撒点 */
    guard = 0;
    while (houses.length < target && guard++ < 12000) {
      const gx = rng.int(CORE, W - CORE - 3), gz = rng.int(CORE, H - CORE - 3);
      if (isWater(gx, gz) || isRoad(gx, gz)) continue;
      let near = false;
      for (let dz = -2; dz <= 2 && !near; dz++) for (let dx = -2; dx <= 2; dx++) if (isRoad(gx + dx, gz + dz)) { near = true; break; }
      if (!near) continue;
      tryHouse(gx, gz);
    }
  }

  /* ── ⑥ 宝塔：距最近民居 ≥ 16 格 ── */
  let tower = null;
  {
    const cand = [];
    for (let z = EDGE_KEEP; z < H - EDGE_KEEP; z++) for (let x = EDGE_KEEP; x < W - EDGE_KEEP; x++) {
      if (type[idx(x, z)] & (TYPE.WATER | TYPE.ROAD | TYPE.BRIDGE | TYPE.HOUSE | TYPE.FIELD)) continue;
      let minD = 1e9;
      for (const [hx, hz] of houseCells) {
        const d = Math.max(Math.abs(hx - x), Math.abs(hz - z));
        if (d < minD) minD = d;
      }
      if (minD >= 16) cand.push({ x, z, minD });
    }
    if (cand.length) {
      /* 偏好离主路近、离河不太近的位置 */
      const mainRoad = roads.find(r => r.kind === 'main');
      cand.sort((a, b) => {
        const da = mainRoad ? Math.min(Math.abs(a.x * cell - mainRoad.x1), Math.abs(a.x * cell - mainRoad.x2)) : 99;
        const db = mainRoad ? Math.min(Math.abs(b.x * cell - mainRoad.x1), Math.abs(b.x * cell - mainRoad.x2)) : 99;
        return da - db;
      });
      const pick = cand[rng.int(0, Math.min(9, cand.length - 1))];
      tower = { gx: pick.x, gz: pick.z, x: wxc(pick.x), z: wzc(pick.z), minHouseDist: pick.minD };
      type[idx(pick.x, pick.z)] |= TYPE.TOWER;
    }
  }

  /* ── ⑤ 农田：外扩一圈内必须有路/水/宅 ── */
  const fields = [];
  {
    const nearAny = (x, z) => {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (isRoad(x + dx, z + dz) || isWater(x + dx, z + dz) || isHouse(x + dx, z + dz)) return true;
      }
      return false;
    };
    const canField = (x, z, w, h) => {
      for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) {
        if (!inb(xx, zz)) return false;
        if (type[idx(xx, zz)] & (TYPE.WATER | TYPE.ROAD | TYPE.BRIDGE | TYPE.HOUSE | TYPE.TOWER | TYPE.PAIFANG)) return false;
      }
      /* 外扩一圈内必须有路/水/宅 */
      for (let zz = z - 1; zz <= z + h; zz++) for (let xx = x - 1; xx <= x + w; xx++) {
        if (!inb(xx, zz)) continue;
        if (isRoad(xx, zz) || isWater(xx, zz) || isHouse(xx, zz)) return true;
      }
      return false;
    };
    let guard = 0;
    while (fields.length < 34 && guard++ < 900) {
      const gx = rng.int(CORE - 4, W - CORE - 2), gz = rng.int(CORE - 4, H - CORE - 2);
      const w = rng.int(2, 6), h = rng.int(2, 6);
      if (!canField(gx, gz, w, h)) continue;
      /* 贴水的种水田，贴路的种菜地，远的种茶园/旱地 */
      let wet = false, road = false;
      for (let zz = gz - 1; zz <= gz + h; zz++) for (let xx = gx - 1; xx <= gx + w; xx++) {
        if (isWater(xx, zz)) wet = true;
        if (isRoad(xx, zz)) road = true;
      }
      const kind = wet ? 'paddy' : road ? (rng.chance(.5) ? 'veg' : 'dry') : (rng.chance(.5) ? 'tea' : 'dry');
      for (let zz = gz; zz < gz + h; zz++) for (let xx = gx; xx < gx + w; xx++) type[idx(xx, zz)] |= TYPE.FIELD;
      fields.push({ gx, gz, w, h, kind, x: wxc(gx + w / 2 - .5), z: wzc(gz + h / 2 - .5) });
    }
  }

  /* ── ⑦ 主路两端 85% 立牌坊 ── */
  const paifangs = [];
  {
    const main = roads.find(r => r.kind === 'main');
    if (main) {
      const vert = Math.abs(main.x2 - main.x1) < Math.abs(main.z2 - main.z1);
      const g1x = Math.round((main.x1 - originX) / cell), g1z = Math.round((main.z1 - originZ) / cell);
      const g2x = Math.round((main.x2 - originX) / cell), g2z = Math.round((main.z2 - originZ) / cell);
      const ends = vert
        ? [{ gx: g1x, gz: g1z, rot: DIR_ROT.S }, { gx: g2x, gz: g2z, rot: DIR_ROT.N }]
        : [{ gx: g1x, gz: g1z, rot: DIR_ROT.W }, { gx: g2x, gz: g2z, rot: DIR_ROT.E }];
      for (const e of ends) {
        if (!rng.chance(.85)) continue;            // ⑦ 85% 概率
        if (!inb(e.gx, e.gz)) continue;
        if (type[idx(e.gx, e.gz)] & (TYPE.WATER | TYPE.HOUSE | TYPE.TOWER)) continue;
        type[idx(e.gx, e.gz)] |= TYPE.PAIFANG;
        paifangs.push({ gx: e.gx, gz: e.gz, x: wxc(e.gx), z: wzc(e.gz), rot: e.rot, kind: rng.chance(.5) ? 'stone' : 'wood' });
      }
    }
  }

  /* ── ⑧ 树：边缘 / 水边 / 树丛处加密 ── */
  const trees = [];
  {
    const dens = new Float32Array(N);
    /* 树丛：几处浓密林地 */
    const groves = [];
    const gn = rng.int(4, 7);
    for (let i = 0; i < gn; i++) {
      const gx = rng.int(EDGE_KEEP, W - EDGE_KEEP), gz = rng.int(EDGE_KEEP, H - EDGE_KEEP);
      const rad = rng.int(3, 7);
      groves.push({ gx, gz, rad });
      for (let z = gz - rad; z <= gz + rad; z++) for (let x = gx - rad; x <= gx + rad; x++) {
        if (!inb(x, z)) continue;
        const d = Math.hypot(x - gx, z - gz);
        if (d <= rad) dens[idx(x, z)] += 0.70 * (1 - d / (rad + 1));
      }
    }
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const t = type[idx(x, z)];
      if (t & (TYPE.WATER | TYPE.ROAD | TYPE.BRIDGE | TYPE.HOUSE | TYPE.FIELD | TYPE.TOWER | TYPE.PAIFANG)) continue;
      let d = 0.11;
      const edge = Math.min(x, z, W - 1 - x, H - 1 - z);
      if (edge <= 6) d += 0.55 * (1 - edge / 7);            // ⑧ 边缘加密
      let nearWater = false, nearHouse = false;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (!inb(x + dx, z + dz)) continue;
        if (type[idx(x + dx, z + dz)] & TYPE.WATER) nearWater = true;
        if (type[idx(x + dx, z + dz)] & TYPE.HOUSE) nearHouse = true;
      }
      if (nearWater) d += 0.40;                              // ⑧ 水边加密
      if (nearHouse) d -= 0.18;
      dens[idx(x, z)] += d;
    }
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const d = dens[idx(x, z)];
      if (d <= 0) continue;
      /* 房屋周围一圈（外扩 1 格）不许长树 —— 房子被树插在门口，
         近观和沉浸视角全是树挡脸。③ 的"房圈留空"必须同样管住树。 */
      let houseBuf = false;
      for (let dz = -1; dz <= 1 && !houseBuf; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (inb(x + dx, z + dz) && (type[idx(x + dx, z + dz)] & TYPE.HOUSE)) { houseBuf = true; break; }
      }
      if (houseBuf) continue;
      const p = Math.min(.92, d);
      let count = 0;
      if (rng() < p) count = 1;
      if (d > .90 && rng() < (d - .90) * 1.8) count = 2;      // 浓处一格两三棵
      /* 这格靠水吗？靠水多种柳（江南水边柳） */
      let nearWater = false, nearHouse = false;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (!inb(x + dx, z + dz)) continue;
        if (type[idx(x + dx, z + dz)] & TYPE.WATER) nearWater = true;
        if (type[idx(x + dx, z + dz)] & TYPE.HOUSE) nearHouse = true;
      }
      const edge2 = Math.min(x, z, W - 1 - x, H - 1 - z);
      for (let k = 0; k < count; k++) {
        const jx = (rng() - .5) * cell * .8, jz = (rng() - .5) * cell * .8;
        let type2 = 'elm';
        if (nearWater) type2 = rng.chance(.6) ? 'willow' : 'gingko';
        else if (d > .8) type2 = rng.chance(.65) ? 'bamboo' : 'pine';
        else if (edge2 <= 6) type2 = rng.chance(.55) ? 'pine' : 'bamboo';
        trees.push({
          x: wxc(x) + jx, z: wzc(z) + jz,
          type: type2, scale: rng.range(.78, 1.35), rot: rng.range(0, Math.PI * 2),
          grove: groves.some(g => Math.hypot(g.gx - x, g.gz - z) <= g.rad)
        });
      }
    }
  }

  /* ── 道具 ── */
  const props = [];
  {
    const push = (gx, gz, kind, rot) => {
      if (!inb(gx, gz)) return;
      if (type[idx(gx, gz)] & (TYPE.WATER | TYPE.ROAD | TYPE.BRIDGE | TYPE.HOUSE | TYPE.TOWER | TYPE.PAIFANG)) return;
      props.push({ kind, rot: rot ?? rng.range(0, Math.PI * 2), x: wxc(gx), z: wzc(gz), gx, gz });
    };
    /* 井、晒谷架在房边；篱笆围田；船在水上；水车在河边；灯笼挂在路口 */
    for (const h of houses) {
      if (rng.chance(.3)) push(h.gx + (rng.chance(.5) ? -1 : h.w), h.gz + rng.int(0, Math.max(0, h.d - 1)), 'jar');
      if (rng.chance(.22)) push(h.gx + rng.int(0, Math.max(0, h.w - 1)), h.gz + (rng.chance(.5) ? -1 : h.d), 'lamp');
      if (rng.chance(.16)) push(h.gx + rng.int(-1, h.w), h.gz + rng.int(-1, h.d), 'well');
    }
    for (const f of fields) {
      if (rng.chance(.5)) push(f.gx + rng.int(0, f.w - 1), f.gz + (rng.chance(.5) ? -1 : f.h), 'dryingrack');
      if (rng.chance(.35)) push(f.gx + (rng.chance(.5) ? -1 : f.w), f.gz + rng.int(0, f.h - 1), 'pen');
    }
    for (const b of bridges) if (rng.chance(.6)) push(b.gx, b.gz, 'lantern');
    /* 水上的乌篷船 */
    for (let i = 0; i < rng.int(3, 7); i++) {
      const r = riverRects[rng.int(0, riverRects.length - 1)];
      if (r.horiz) {
        const gx = rng.int(6, W - 7), gz = r.z0 + rng.int(0, r.w - 1);
        props.push({ kind: 'boat', gx, gz, x: wxc(gx), z: wzc(gz), rot: rng.chance(.5) ? 0 : Math.PI });
      } else {
        const gz = rng.int(6, H - 7), gx = r.x0 + rng.int(0, r.w - 1);
        props.push({ kind: 'boat', gx, gz, x: wxc(gx), z: wzc(gz), rot: rng.chance(.5) ? Math.PI / 2 : -Math.PI / 2 });
      }
    }
    /* 水车：河边的直段 */
    for (const r of rivers) {
      const gx = r.horiz ? rng.int(8, W - 9) : Math.round(r.x1 / cell);
      const gz = r.horiz ? Math.round(r.z1 / cell) : rng.int(8, H - 9);
      props.push({ kind: 'waterwheel', gx, gz, x: wxc(gx), z: wzc(gz), rot: r.horiz ? 0 : Math.PI / 2 });
      break;
    }
  }

  const stats = {
    house: houses.length, field: fields.length, tree: trees.length,
    paifang: paifangs.length, tower: tower ? 1 : 0, water: riverRects.length,
    road: roads.length, prop: props.length
  };
  const landmark = {
    name: rng.pick(NAME_A) + rng.pick(NAME_B),
    sub: rng.pick(NAME_C),
    seed: (typeof seed === 'number' ? seed : (parseInt(String(seed), 10) || 0))
  };

  const layout = {
    W, H, cell, originX, originZ, type, TYPE, seed,
    rivers, roads, bridges, houses, fields, trees, tower, paifangs, props,
    landmark, stats,
    cellType(x, z) { return inb(x, z) ? type[idx(x, z)] : TYPE.EMPTY; },
    isWater, isRoad, isHouse, isField,
    gx2w(gx) { return originX + (gx + .5) * cell; },
    gz2w(gz) { return originZ + (gz + .5) * cell; }
  };
  return layout;
}
