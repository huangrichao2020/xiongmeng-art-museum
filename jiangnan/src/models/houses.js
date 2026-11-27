/* 江南古村 · 民居模型（粉墙黛瓦 / 马头墙 / 木门木窗）
   ------------------------------------------------------------------
   本版把"塑料白盒"重做成有质感的江南粉墙黛瓦：

   ① 墙：牙白带灰度的粉墙（不是死白），底下是**青灰砖勒脚**（带砖缝，
      明显是砖不是墙漆），墙根一条返潮带、檐下一条水渍带，
      墙顶有**墙帽砖线 + 挑檐小檐**（檐口压顶），墙面色差两档。
   ② 瓦：屋面是**真正的瓦垄曲面**——每垄一条平法线的折面，逐垄吃光；
      贴图按垄距对齐（垄心 x = k·垄距），远处不再是一整块死板；
      **正脊立起来**：脊身 + 脊瓦 + 脊侧瓦当 + 两端翘角；
      **檐口一排滴水瓦当**。
   ③ 山墙：对称阶梯**马头墙**（Shape 挤出，一整块没有接缝），
      顶上一圈**压顶瓦**（踏面 + 踢面包边），中间挂一枚**悬鱼**。
   ④ 门窗：窗有窗框 / 窗棂 / 窗套 / 窗台，窗洞往里退 6cm，
      窗纸藏在洞里透暖光（洞内侧是暗的）；门有门框 / 门簪 /
      门槛石 / 抱鼓石，门板后头是暗的。
   ⑤ 接地阴影：每栋房脚下一片软 AO（core/ao.js），强度 .45。

   契约：
   · 只吃 layout；随机走 makeRng(layout.seed ^ 0x11)，逐栋再派生种子；
     贴图里的噪点用固定种子的本地 rng（同 seed 必得同一张图）。
   · 同材质构件全部合并（全模块 ≈ 16 个 draw call，含 1 个 AO 批次）。
   · 合并后统一 fixUpNormals —— 历史上有一半屋顶法线朝下导致完全不受光。
   · 几何必须静态合批，不能每栋房一堆独立 mesh。
*/
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { initMaterials, MAT } from '../core/materials.js';
import { mergeGeometries, fixUpNormals, nonIndexed } from '../core/geo.js';
import { aoBatch, aoPatch } from '../core/ao.js';

const CELL_FALLBACK = 3.2;   // layout.cell 缺失时的兜底
const WALL_T = 0.18;         // 墙体厚
const GABLE_T = 0.24;        // 马头墙厚
const PLINTH_H = 0.52;       // 青灰砖勒脚高

/* 门朝向角（由 door 字段反解） */
const DOOR_THETA = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };

/* ── 基础几何小工具 ─────────────────────────────────────────── */
function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function cyl(rt, rb, h, seg, x, y, z, rx = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/* ── 程序化贴图（自建，全部共享，每张只生成一次）────────────── */
function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function mkTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/* 固定种子的本地 rng（贴图噪点用，保证同 seed 同图） */
function lcg(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 粉墙：牙白底 + 竖向雨痕 + 抹灰补丁 + 细颗粒
   （不要大团柔和斑 —— 那种会看成迷彩/水泥；真实粉墙是干净的底子
     + 一道道竖流痕 + 几块颜色略深的抹灰补面） */
function plasterCanvas() {
  const W = 512, H = 512, [c, g] = cv(W, H);
  const r = lcg(0x9E37);
  g.fillStyle = '#eae6de'; g.fillRect(0, 0, W, H);
  /* 竖向雨痕：从上往下的细流痕 */
  for (let i = 0; i < 52; i++) {
    const x = r() * W, w = 1.5 + r() * 6, h = 90 + r() * 330, y0 = r() * (H - h);
    const grd = g.createLinearGradient(0, y0, 0, y0 + h);
    grd.addColorStop(0, 'rgba(112,104,90,0)');
    grd.addColorStop(.10, 'rgba(112,104,90,.075)');
    grd.addColorStop(.75, 'rgba(112,104,90,.045)');
    grd.addColorStop(1, 'rgba(112,104,90,0)');
    g.fillStyle = grd; g.fillRect(x, y0, w, h);
  }
  /* 细颗粒 + 少量麻点 */
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = r() > .5 ? 'rgba(140,131,114,.07)' : 'rgba(255,253,246,.09)';
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = 'rgba(120,111,96,.10)';
    g.beginPath(); g.ellipse(r() * W, r() * H, .8 + r() * 1.6, .8 + r() * 1.4, 0, 0, 7); g.fill();
  }
  return c;
}

/* 青灰砖：4 列 × 8 行，砖长 0.24m、砖高 0.08m（= 一贴图 0.96×0.64m） */
function brickCanvas() {
  const W = 512, H = 512, [c, g] = cv(W, H);
  const r = lcg(0x51A7);
  g.fillStyle = '#6d6f68'; g.fillRect(0, 0, W, H);       // 灰缝
  const rows = 8, rh = H / rows, bw = W / 4;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * bw * 0.5;
    for (let k = -1; k < 4; k++) {
      const x = k * bw + off, y = row * rh;
      const v = 124 + r() * 38;
      g.fillStyle = `rgb(${(v * .99) | 0},${v | 0},${(v * 1.02) | 0})`;
      g.fillRect(x + 1.7, y + 1.7, bw - 3.4, rh - 3.4);
      for (let i = 0; i < 24; i++) {                      // 砖面细纹
        g.fillStyle = r() > .5 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.06)';
        g.fillRect(x + 2 + r() * (bw - 4), y + 2 + r() * (rh - 4), 1 + r() * 3, 1 + r() * 2);
      }
    }
  }
  return c;
}

/* 小青瓦：8 条瓦垄（垄心在 x = k·64）+ 很淡的横向搭接线 */
function tileCanvas2() {
  const W = 512, H = 512, [c, g] = cv(W, H);
  const r = lcg(0x77C3);
  const per = 64;
  for (let k = -1; k <= 8; k++) {
    const cx = k * per;
    const grd = g.createLinearGradient(cx - per / 2, 0, cx + per / 2, 0);
    grd.addColorStop(0.00, '#4b5155');
    grd.addColorStop(0.13, '#666d73');
    grd.addColorStop(0.33, '#899097');
    grd.addColorStop(0.50, '#98a0a6');
    grd.addColorStop(0.67, '#848c92');
    grd.addColorStop(0.88, '#5b6267');
    grd.addColorStop(1.00, '#474d51');
    g.fillStyle = grd; g.fillRect(cx - per / 2, 0, per, H);
  }
  for (let y = 0; y < H; y += 128) {                     // 瓦行搭接线
    const grd = g.createLinearGradient(0, y, 0, y + 18);
    grd.addColorStop(0, 'rgba(26,28,30,.36)');
    grd.addColorStop(1, 'rgba(26,28,30,0)');
    g.fillStyle = grd; g.fillRect(0, y, W, 18);
  }
  for (let i = 0; i < 620; i++) {                        // 苔痕 / 积灰
    g.fillStyle = r() > .6 ? 'rgba(106,120,90,.11)' : 'rgba(228,226,216,.08)';
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2);
  }
  return c;
}

let _HM = null;
function houseMats() {
  if (_HM) return _HM;
  const plaster = mkTex(plasterCanvas());
  const brick = mkTex(brickCanvas());
  const tile = mkTex(tileCanvas2());
  const std = (o) => new THREE.MeshStandardMaterial(o);
  /* 粉墙：底色直接沿用 core 的 MAT.wall（0xcfc4ae 暖灰米），
     只把贴图换成自己的灰泥质感，并打开顶点色做「每面墙 ±3% 明度扰动」。
     —— 不要用纯白，粉墙本来就是带灰的米白。 */
  const wallMat = (col) => {
    const m = MAT.wall.clone();
    m.color.set(col);
    m.map = plaster;
    m.bumpMap = plaster;
    m.bumpScale = .022;
    m.roughness = .95;
    m.vertexColors = true;
    m.needsUpdate = true;
    return m;
  };
  _HM = {
    wallA: wallMat(0xcfc4ae),
    wallB: wallMat(0xc5baa2),
    /* 返潮 / 水渍带：更沉更脏，顶点色做「向上渐隐」 */
    damp: std({ color: 0x8a8069, map: plaster, bumpMap: plaster, bumpScale: .02, roughness: .98, vertexColors: true }),
    /* 青灰砖勒脚 */
    brick: std({ color: 0xa9ada7, map: brick, bumpMap: brick, bumpScale: .04, roughness: .95 }),
    /* 黛瓦 */
    tileA: std({ color: 0xa9afb1, map: tile, bumpMap: tile, bumpScale: .045, roughness: .78, metalness: .03 }),
    tileB: std({ color: 0x949b9e, map: tile, bumpMap: tile, bumpScale: .045, roughness: .82 }),
    /* 正脊压顶：比瓦深一档 */
    tileDark: std({ color: 0x7e8488, map: tile, bumpMap: tile, bumpScale: .045, roughness: .84 }),
    /* 窗纸：夜里要亮（emissiveIntensity ≥ 1）*/
    paperWin: std({ color: 0xf0d59a, map: MAT.paper.map, roughness: .9, emissive: 0xffca70, emissiveIntensity: 1.15 }),
  };
  return _HM;
}

/* ── 顶点色工具：每面墙 ±3% 明度扰动 / 返潮带向上渐隐 ───────── */
function tintGeo(g, v) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function gradY(g, y0, y1, c0, c1) {
  const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.max(0, Math.min(1, (p.getY(i) - y0) / Math.max(1e-6, y1 - y0)));
    const v = c0 + (c1 - c0) * t;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/* ── 材质桶：key → 几何数组（同材质最后合成一个大 mesh）──────── */
function put(buckets, key, geo, mtx) {
  const g = nonIndexed(geo);
  if (mtx) g.applyMatrix4(mtx);
  let arr = buckets.get(key);
  if (!arr) { arr = []; buckets.set(key, arr); }
  arr.push(g);
}

/* ── 按每面实际尺寸重算 UV（cycles per meter）─────────────────
   BoxGeometry 顶点顺序：px,nx,py,ny,pz,nz，每面 4 个顶点 */
function remapUV(g, w, h, d, per) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [ul, vl] = dims[f];
    const [pu, pv] = per[f];
    for (let i = f * 4; i < f * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * ul * pu, uv.getY(i) * vl * pv);
    }
  }
  uv.needsUpdate = true;
  return g;
}
/* 粉墙：1 贴图 / 1.7m */
const UV_PLASTER = [[1 / 1.7, 1 / 1.7], [1 / 1.7, 1 / 1.7], [1 / 1.7, 1 / 1.7],
[1 / 1.7, 1 / 1.7], [1 / 1.7, 1 / 1.7], [1 / 1.7, 1 / 1.7]];
/* 青砖：u 0.24m/块、v 0.08m/皮 */
const UV_BRICK = [[1 / .96, 1 / .64], [1 / .96, 1 / .64], [1 / .96, 1 / .96],
[1 / .96, 1 / .96], [1 / .96, 1 / .64], [1 / .96, 1 / .64]];

/* ── 带洞口的墙板（墙底 y=0，墙厚沿 z 居中，洞 = {u,v,w,h}）──── */
function wallWithHoles(w, h, t, holes) {
  const parts = [];
  const xs = new Set([-w / 2, w / 2]);
  for (const o of holes) { xs.add(o.u - o.w / 2); xs.add(o.u + o.w / 2); }
  const xa = [...xs].sort((a, b) => a - b);
  for (let i = 0; i < xa.length - 1; i++) {
    const x0 = xa[i], x1 = xa[i + 1];
    const sw = x1 - x0;
    if (sw < 1e-5) continue;
    const cx = (x0 + x1) / 2;
    const cut = holes
      .filter(o => o.u - o.w / 2 < cx + 1e-6 && o.u + o.w / 2 > cx - 1e-6)
      .sort((a, b) => a.v - b.v);
    let y = 0;
    for (const o of cut) {
      if (o.v > y + 1e-5) {
        const bh = o.v - y;
        const b = box(sw, bh, t, cx, y + bh / 2, 0);
        remapUV(b, sw, bh, t, UV_PLASTER);
        parts.push(b);
      }
      y = Math.max(y, o.v + o.h);
    }
    if (h > y + 1e-5) {
      const bh = h - y;
      const b = box(sw, bh, t, cx, y + bh / 2, 0);
      remapUV(b, sw, bh, t, UV_PLASTER);
      parts.push(b);
    }
  }
  return mergeGeometries(parts.map(nonIndexed), false);
}

/* ── 屋面：瓦垄曲面（逐垄平法线）─────────────────────────────
   垄沿坡向排（从脊到檐），周期 pitch；每垄 2 个采样 → 折面，
   一垄一个法线 → 受光面亮、背光面暗，远处也数得出垄。
   UV：u = 8 垄 / 贴图，v = courses 行 / 贴图 → 贴图与几何垄对齐。*/
function slopeGeo(rw, rd, h, side, opt) {
  const courses = opt.courses ?? 4;
  const curve = opt.curve ?? .24;
  const amp = opt.amp ?? .052;
  const half = rd / 2;
  const slopeLen = Math.hypot(half, h);
  const ny = half / slopeLen, nz = side * h / slopeLen;
  const n = Math.max(6, 2 * Math.round(rw / (2 * opt.pitch)));   // 垄数取偶 → 与贴图对齐
  const p = rw / n;                                              // 实际垄距
  const nu = n * 2, nv = courses * 2;
  const P = [];
  for (let j = 0; j <= nv; j++) {
    const t = j / nv;
    for (let i = 0; i <= nu; i++) {
      const x = -rw / 2 + i * (p / 2);
      const xn = Math.min(1, Math.abs(x) / (rw / 2));
      const lift = curve * Math.pow(xn, 2.6) * t * t * 1.6;      // 檐角起翘
      const row = .014 * ((t * courses) % 1);                    // 瓦行搭接台阶
      const w = .5 * (1 + Math.cos(2 * Math.PI * x / p));        // 瓦垄波形 0..1
      const off = amp * (w - .5);
      const y = h * (1 - t) + lift + row + off * ny;
      const z = side * (half * t) + off * nz;
      P.push([x, y, z, (x + rw / 2) / (8 * p), t * courses / 4]);
    }
  }
  const pos = [], nor = [], uv = [];
  const push = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz2 = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny2, nz2) || 1;
    nx /= l; ny2 /= l; nz2 /= l;
    if (ny2 < 0) { nx = -nx; ny2 = -ny2; nz2 = -nz2; }   // 保证朝上（后面还会统一修）
    for (const q of [a, b, c]) { pos.push(q[0], q[1], q[2]); nor.push(nx, ny2, nz2); uv.push(q[3], q[4]); }
  };
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = P[j * (nu + 1) + i], b = P[j * (nu + 1) + i + 1];
      const c = P[(j + 1) * (nu + 1) + i], d = P[(j + 1) * (nu + 1) + i + 1];
      push(a, c, b); push(b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/* 滴水瓦当：倒三角小瓦（3 个面，无底盖）
   不用 ConeGeometry(…,3) —— 它的底盖在这个分段下会生成 3 个零面积三角形。 */
function dripGeo(r, h) {
  const pos = [], nor = [], uv = [];
  const apex = [0, -h / 2, 0];
  const ring = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    ring.push([Math.cos(a) * r, h / 2, Math.sin(a) * r]);
  }
  for (let i = 0; i < 3; i++) {
    const b = ring[i], c = ring[(i + 1) % 3];
    const ux = b[0] - apex[0], uy = b[1] - apex[1], uz = b[2] - apex[2];
    const vx = c[0] - apex[0], vy = c[1] - apex[1], vz = c[2] - apex[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    pos.push(apex[0], apex[1], apex[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) nor.push(nx, ny, nz);
    uv.push(0.5, 0, 0, 1, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/* ── 整座屋顶：瓦垄屋面 + 正脊（脊身/脊瓦/瓦当/翘角）+ 檐口滴水 ──
   W/D = 墙面宽深；opt.over = 挑檐；opt.pitch = 瓦垄间距（0.18~0.25m）
   返回 { tile, ridge, soffit }：正脊单独一档（比瓦深），望板归木。 */
function roofGeo(W, D, h, opt = {}) {
  const over = opt.over ?? .40;
  const gableOut = opt.gableOut ?? GABLE_T;
  /* 屋面的 X 向总宽：屋檐边**埋进马头墙的墙身中间**。
     之前屋檐边离山墙外皮只有 3cm，屏幕空间 AO（GTAO）会把这条窄缝
     判成极强遮挡 → 屋檐边出现纯黑三角。改成硬山做法：瓦口嵌进墙里。 */
  const rw = W + gableOut;
  const rd = D + 2 * over;                     // 屋面总深（Z）
  const parts = [];                            // 瓦面
  const ridgeParts = [];                       // 正脊（更深一档）
  const soffitParts = [];                      // 檐底望板
  const courses = opt.courses ?? 4;
  for (const s of [-1, 1]) {
    parts.push(slopeGeo(rw, rd, h, s, {
      courses, curve: opt.curve ?? .24, amp: opt.amp ?? .052, pitch: opt.pitch ?? .22,
    }));
  }

  /* ── 正脊 ─────────────────────────────────────────────── */
  const ridgeY = h;
  const rb = box(rw + .12, .10, .40, 0, ridgeY + .05, 0);            // 脊座
  remapUV(rb, rw + .12, .10, .40, UV_PLASTER);
  ridgeParts.push(rb);
  const rs = box(rw + .04, .17, .23, 0, ridgeY + .185, 0);            // 脊身
  remapUV(rs, rw + .04, .17, .23, UV_PLASTER);
  ridgeParts.push(rs);
  for (const s of [-1, 1]) {                                          // 脊瓦（两坡小盖）
    const cap = box(rw + .08, .065, .38, 0, 0, 0);
    cap.rotateX(s * .52);
    cap.translate(0, ridgeY + .285, s * .085);
    remapUV(cap, rw + .08, .065, .38, UV_PLASTER);
    ridgeParts.push(cap);
  }
  /* 脊侧瓦当：一排小圆瓦（朝街面那一侧） */
  const nDisc = Math.max(4, Math.round(rw / .72));
  for (let i = 0; i < nDisc; i++) {
    const x = -rw / 2 + rw * (i + .5) / nDisc;
    const d = cyl(.052, .052, .035, 6, x, ridgeY + .13, -.135);
    d.rotateX(Math.PI / 2);
    ridgeParts.push(d);
  }
  /* 脊端翘角：4 段递进 */
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const ang = t * .95;
      const seg = box(.30, .085, .17, 0, 0, 0);
      seg.rotateZ(sx * ang * .9);
      seg.translate(sx * (rw / 2 - .16 + t * .34), ridgeY + .27 + Math.sin(ang) * .30, 0);
      remapUV(seg, .30, .085, .17, UV_PLASTER);
      ridgeParts.push(seg);
    }
  }

  /* ── 博风板：山墙外沿的封檐板（贴着屋面斜边）────────────── */
  {
    const lift = (opt.curve ?? .24) * 1.6;
    const a = Math.atan2(h - lift, rd / 2);
    const len = Math.hypot(rd / 2, h - lift);
    for (const s of [-1, 1]) {
      const bf = box(0.10, 0.17, len, 0, 0, 0);
      bf.rotateX(s * a);
      bf.translate(s * (rw / 2 + 0.035), (h + lift) / 2, s * rd / 4);
      remapUV(bf, 0.10, 0.17, len, UV_PLASTER);
      ridgeParts.push(bf);
    }
  }

  /* ── 檐口：封檐板 + 一排滴水 + 檐底望板（出檐的暗影靠它）── */
  const slopeA = Math.atan2(h, rd / 2);
  for (const s of [-1, 1]) {
    const fascia = box(rw + .04, .10, .09, 0, -.045, s * (rd / 2 - .04));
    remapUV(fascia, rw + .04, .10, .09, UV_PLASTER);
    parts.push(fascia);
    const n = Math.max(8, Math.round(rw / .30));
    for (let i = 0; i < n; i++) {
      const x = -rw / 2 + rw * (i + .5) / n;
      const drip = dripGeo(.055, .10);
      drip.rotateZ(.35);
      drip.translate(x, -.105, s * (rd / 2 + .02));
      parts.push(drip);
    }
    /* 望板：贴着坡面架在出檐下面，檐下就是一条实打实的暗影。
       偏移量 = -0.085 × 坡面法线；法线的 z 分量 nz 自带 s，这里**不能再乘 s**
       —— 否则 s=-1 那一侧会整体外移 7.6cm，望板戳穿屋面，
       屋坡上会出现一条横贯全宽的纯黑带（望板顶面露在瓦面之上）。 */
    const slopeLen = Math.hypot(rd / 2, h);
    const ny = (rd / 2) / slopeLen;
    const nz = s * h / slopeLen;
    const tIn = 1 - (over + .12) / rd;        // 内端（压到墙皮外一点）
    const tOut = .985;                        // 外端（停在檐口内侧，不外露）
    const tMid = (tIn + tOut) / 2;
    const soffLen = (tOut - tIn) * slopeLen;
    const sb = box(rw * .99, .05, soffLen, 0, 0, 0);
    sb.rotateX(s * slopeA);
    sb.translate(0, h * (1 - tMid) - .085 * ny, s * (rd / 2 * tMid) - .085 * nz);
    soffitParts.push(sb);
  }
  const out = { tile: [], ridge: [], soffit: [] };
  if (parts.length) {
    const g = mergeGeometries(parts.map(nonIndexed), false);
    fixUpNormals(g);
    out.tile.push(g);
  }
  if (ridgeParts.length) {
    const g = mergeGeometries(ridgeParts.map(nonIndexed), false);
    fixUpNormals(g);
    out.ridge.push(g);
  }
  if (soffitParts.length) {
    const g = mergeGeometries(soffitParts.map(nonIndexed), false);
    fixUpNormals(g);
    out.soffit.push(g);
  }
  return out;
}

/* ── 马头墙：对称阶梯轮廓（Shape 挤出，一整块没有接缝）────────────
   轮廓在 (z,y) 平面：中间是高出正脊的脊台，两边各退三级台阶，
   台阶高度必须 ≥ 屋面在山墙处的高度（否则瓦会从墙后冒出来）。
   墙只盖到房身进深（±D/2），檐口那圈由屋顶挑出（悬山做法）。 */
function gableWall(D, h, opt = {}) {
  const over = opt.over ?? .46;
  const curve = opt.curve ?? .24;
  const roofBase = opt.base ?? 0;
  const L = D / 2;                       // 墙的半长（= 房身进深一半）
  const eaveHalf = L + over;             // 屋面半深
  /* 屋面在山墙外沿（角部起翘后）的高度 */
  const roofY = (z) => {
    const t = Math.min(1, Math.abs(z) / eaveHalf);
    return roofBase + h * (1 - t) + curve * t * t * 1.6;
  };
  const c0 = L * 0.115, c1 = L * 0.365, c2 = L * 0.62;
  const RISE = 0.42;
  let H0 = roofBase + h + 0.30;                       // 中央脊台
  let H3 = Math.max(roofY(L) + 0.12, H0 - 3 * RISE); // 外端（不得低于檐角）
  const H2 = H3 + RISE, H1 = H2 + RISE;
  if (H1 + RISE > H0) H0 = H1 + RISE;

  const s = new THREE.Shape();
  s.moveTo(-L, 0);
  s.lineTo(-L, H3);
  s.lineTo(-c2, H3);
  s.lineTo(-c2, H2);
  s.lineTo(-c1, H2);
  s.lineTo(-c1, H1);
  s.lineTo(-c0, H1);
  s.lineTo(-c0, H0);
  s.lineTo(c0, H0);
  s.lineTo(c0, H1);
  s.lineTo(c1, H1);
  s.lineTo(c1, H2);
  s.lineTo(c2, H2);
  s.lineTo(c2, H3);
  s.lineTo(L, H3);
  s.lineTo(L, 0);
  s.lineTo(-L, 0);
  const panel = new THREE.ExtrudeGeometry(s, { depth: GABLE_T, bevelEnabled: false });
  panel.rotateY(Math.PI / 2);                       // 挤出方向 z → x
  panel.computeVertexNormals();
  /* 挤出体的 UV 是造型坐标（米）→ 缩到和墙面同一个密度 */
  {
    const uv = panel.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.7, uv.getY(i) / 1.7);
    uv.needsUpdate = true;
  }

  /* 压顶瓦：沿轮廓顶边铺一条（踏面水平、踢面竖向）*/
  const caps = [];
  const segs = [
    [-L, -c2, H3], [-c2, -c1, H2], [-c1, -c0, H1], [-c0, c0, H0],
    [c0, c1, H1], [c1, c2, H2], [c2, L, H3],
  ];
  const T = GABLE_T + 0.13, CT = 0.085;
  for (const [z0, z1, y] of segs) {
    const len = z1 - z0;
    if (len < 1e-4) continue;
    caps.push(box(T, CT, len, 0, y + CT / 2, (z0 + z1) / 2));
  }
  const risers = [[-c2, H3, H2], [-c1, H2, H1], [-c0, H1, H0], [c0, H1, H0], [c1, H2, H1], [c2, H3, H2]];
  for (const [z, ya, yb] of risers) {
    const hh = Math.abs(ya - yb);
    if (hh < 1e-4) continue;
    caps.push(box(T, hh, 0.11, 0, (ya + yb) / 2, z));
  }
  return { panel, caps, H0, H3 };
}

/* ── 悬鱼：山墙中央垂挂的小饰件 ─────────────────────────── */
function xuanYuGeo() {
  const parts = [];
  const body = new THREE.ConeGeometry(.085, .40, 4);
  body.rotateX(Math.PI);
  body.translate(0, -.20, 0);
  parts.push(body);
  const head = box(.19, .10, .07, 0, .045, 0);
  parts.push(head);
  const ring = new THREE.TorusGeometry(.045, .014, 4, 8);
  ring.rotateY(Math.PI / 2);
  ring.translate(0, .13, 0);
  parts.push(ring);
  return mergeGeometries(parts.map(nonIndexed), false);
}

/* ── 窗：窗套 + 窗框 + 窗棂（凸出墙面 5cm），窗纸退到洞里 ──────
   局部 z = 0 是墙外皮，z 为负 = 凸出墙外。
   棂条前端在 z = -0.05（凸出 5cm），窗纸在 z = +0.11（有进深）。*/
function windowGeo(w, h) {
  const parts = [];
  /* 窗套：贴着墙外皮的一圈凸边（凸出 4~6cm）*/
  const ct = .085, cd = .06;
  parts.push(box(w + .28, ct, cd, 0, h + ct / 2 + .015, -.02));
  parts.push(box(w + .28, ct, cd, 0, -ct / 2 - .015, -.02));
  parts.push(box(ct, h + .16, cd, -w / 2 - ct / 2 - .015, h / 2, -.02));
  parts.push(box(ct, h + .16, cd, w / 2 + ct / 2 + .015, h / 2, -.02));
  /* 窗框 */
  const t = .065, d = .075;
  parts.push(box(w + t * 2, t, d, 0, h + t / 2, .005));
  parts.push(box(w + t * 2, t, d, 0, -t / 2, .005));
  parts.push(box(t, h + t * 2, d, -w / 2 - t / 2, h / 2, .005));
  parts.push(box(t, h + t * 2, d, w / 2 + t / 2, h / 2, .005));
  /* 窗棂：2 竖 1 横，前端凸出墙面 5cm */
  parts.push(box(.045, h, .07, -w / 6, h / 2, -.015));
  parts.push(box(.045, h, .07, w / 6, h / 2, -.015));
  parts.push(box(w, .045, .07, 0, h * .46, -.015));
  return mergeGeometries(parts.map(nonIndexed), false);
}

/* ── 门：门框 + 门板 + 门簪（暗处在门板后头）────────────── */
function doorGeo2(w, h) {
  const parts = [];
  const lw = w / 2 - .012;
  for (const s of [-1, 1]) {
    const leaf = box(lw, h - .04, .06, s * (lw / 2 + .012), (h - .04) / 2, 0);
    parts.push(leaf);
  }
  /* 中缝 */
  parts.push(box(.028, h - .04, .075, 0, (h - .04) / 2, .006));
  /* 门簪：两对 */
  for (const sx of [-1, 1]) for (const sy of [.80, .60]) {
    const d = new THREE.CylinderGeometry(.05, .05, .085, 8);
    d.rotateX(Math.PI / 2);
    d.translate(sx * w * .26, h * sy, .055);
    parts.push(d);
  }
  return mergeGeometries(parts.map(nonIndexed), false);
}

/* ── 炊烟烟柱位置：严格对齐 core/effects.js ────────────────────
   effects.js 用 makeRng(seed ^ 0x51ed)，先消费窗口灯（每盏 4 次 rng），
   再消费炊烟（每根 4 次 rng：x, z, y, s）。这里照同样的次序消费，
   取出那 7 根烟柱的世界坐标 → 房屋屋顶上按同样位置立烟囱。 */
function smokePicks(layout) {
  const houses = (layout && layout.houses) || [];
  const map = new Map();
  if (!houses.length) return map;
  const r = makeRng(((layout.seed | 0) ^ 0x51ed) >>> 0);
  /* ① 窗口灯：最多 16 盏，每盏 4 次 rng（x, z, base, ph）*/
  const stepW = Math.max(1, Math.floor(houses.length / 16));
  let n = 0;
  for (let i = 0; i < houses.length && n < 16; i += stepW) { r(); r(); r(); r(); n++; }
  /* ② 炊烟：最多 7 根，每根 4 次 rng（x, z, y, s）*/
  const stepS = Math.max(1, Math.floor(houses.length / 7));
  for (let i = 0; i < houses.length && map.size < 7; i += stepS) {
    const h = houses[i];
    const x = h.x + (r() - .5) * 1.2;
    const z = h.z + (r() - .5) * 1.2;
    const y = 4.6 + r() * 1.6;
    r();
    map.set(i, { x, z, y });
  }
  return map;
}

/* ── 房身尺寸（纯函数，可单独测试）─────────────────────────── */
export function houseDims(h, cell) {
  const c = cell || CELL_FALLBACK;
  const mx = Math.min(0.8, c * 0.25);      // 两侧余量
  const mz = Math.min(1.2, c * 0.375);     // 前后余量（门前留檐口）
  const W = Math.max(2.0, (h.w || 2) * c - mx);
  const D = Math.max(2.0, (h.d || 2) * c - mz);
  return { W, D };
}

/* ══════════════════════════════════════════════════════════════
   单栋民居
   ══════════════════════════════════════════════════════════════ */
function buildHouse(h, idx, buckets, baseSeed, cell, aoPts, smoke, chimneyList) {
  const rng = makeRng((baseSeed ^ Math.imul(idx + 1, 0x9E3779B1)) | 0);
  const theta = (h.door && DOOR_THETA[h.door] !== undefined) ? DOOR_THETA[h.door] : -(h.rot || 0);
  const M4 = new THREE.Matrix4().makeRotationY(theta).setPosition(h.x || 0, 0, h.z || 0);
  const P = (key, geo, tint) => {
    /* 墙面：每面墙一个 ±3% 明度扰动，避免所有墙一个死白。
       同一 bucket 的几何属性必须一致，所以墙材质的东西一律补上顶点色。 */
    if (key === 'wallA' || key === 'wallB') {
      if (!geo.attributes.color) tintGeo(geo, tint != null ? tint : 1.0);
    }
    put(buckets, key, geo, M4);
  };
  /* 每面墙的明度扰动（±3%），一次一抽，同 seed 必得同一张图 */
  const wallTint = () => 0.97 + rng() * 0.06;

  const kind = h.kind || 'common';
  const style = (((h.style | 0) % 4) + 4) % 4;
  const floors = kind === 'rich' ? 2 : (h.floors >= 2 ? 2 : 1);

  const { W, D } = houseDims(h, cell);
  const HW = W / 2, HD = D / 2;

  const isGran = kind === 'granary';
  const isShrine = kind === 'shrine';
  const isRich = kind === 'rich';

  const wallKey = (idx % 3 === 0) ? 'wallB' : 'wallA';
  const tileKey = (idx % 4 === 0) ? 'tileB' : 'tileA';

  /* ── 尺寸 ─────────────────────────────────────────────────── */
  const plinthH = isGran ? 0.76 : (isShrine ? 0.60 : PLINTH_H);
  const storyH = Math.min(2.75, Math.max(2.30, 2.15 + Math.min(W, D) * 0.08));
  const wallH = floors * storyH;
  const wallTop = plinthH + wallH;
  const roofH = Math.min(1.70, Math.max(1.05, 0.82 + 0.13 * D));
  const over = isGran ? 0.52 : 0.40;
  const roofBase = wallTop + 0.15;
  const wallMatKey = isGran ? 'dirt' : wallKey;         // 粮仓夯土偏黄褐

  /* ── 门窗洞（面宽两间：门居中，左右各一间）────────────────── */
  const dw = isGran ? Math.min(0.85, W * 0.16)
    : isShrine ? Math.min(1.00, W * 0.19)
      : Math.min(1.15, W * 0.22);
  const dh = isGran ? Math.min(1.55, storyH * 0.62)
    : isShrine ? Math.min(1.85, storyH * 0.72)
      : Math.min(2.05, storyH * 0.80);
  const doorU = 0;
  const winH = Math.min(1.05, storyH * 0.42);
  const sill = Math.min(0.95, storyH * 0.38);
  const space = HW - dw / 2 - 0.20;
  const per = space >= 2.20 ? 2 : ((style >= 1 && space >= 1.05) ? 2 : (space >= 0.60 ? 1 : 0));
  const ww = per ? Math.min(1.15, (space - 0.20 * (per - 1)) / per) : 0;

  const frontHoles = [], backHoles = [], frontWins = [], backWins = [];
  frontHoles.push({ u: doorU, v: 0, w: dw, h: dh });

  for (const s of [-1, 1]) {
    for (let j = 0; j < per; j++) {
      const u = s * (dw / 2 + 0.22 + ww / 2 + j * (ww + 0.22));
      if (Math.abs(u) + ww / 2 > HW - 0.06) continue;
      frontWins.push({ u, v: sill, w: ww, h: winH });
      frontHoles.push({ u, v: sill, w: ww, h: winH });
    }
  }
  const bw2 = Math.min(1.0, W * 0.2);
  if (HW > bw2 + 0.34) {
    for (const s of [-1, 1]) {
      const u = s * (bw2 / 2 + 0.24);
      backWins.push({ u, v: sill, w: bw2, h: winH });
      backHoles.push({ u, v: sill, w: bw2, h: winH });
    }
  }
  if (floors === 2) {
    const w2 = Math.min(0.95, W * 0.19);
    for (const s of [-1, 1]) {
      const u = s * (dw / 2 + 0.30 + w2 / 2);
      if (Math.abs(u) + w2 / 2 > HW - 0.06) continue;
      frontWins.push({ u, v: storyH + 0.88, w: w2, h: Math.min(0.92, storyH * 0.34) });
      frontHoles.push({ u, v: storyH + 0.88, w: w2, h: Math.min(0.92, storyH * 0.34) });
    }
  }
  if (isShrine && dh + 0.14 + 0.34 < wallH - 0.08) {
    const vw = Math.min(0.50, W * 0.14);
    frontWins.push({ u: doorU, v: dh + 0.14, w: vw, h: 0.34 });
    frontHoles.push({ u: doorU, v: dh + 0.14, w: vw, h: 0.34 });
  }

  /* ── 勒脚：青灰砖基座 + 顶部砖线 ────────────────────────── */
  if (isGran) {
    const px = W > 3.6 ? [-HW + 0.34, 0, HW - 0.34] : [-HW + 0.32, HW - 0.32];
    const pz = D > 3.6 ? [-HD + 0.34, 0, HD - 0.34] : [-HD + 0.32, HD - 0.32];
    for (const x of px) for (const z of pz) P('stone', box(0.28, 0.48, 0.28, x, 0.24, z));
    P('woodDark', box(W + 0.10, 0.14, D + 0.10, 0, 0.62, 0));      // 木地板
  } else {
    const pl = box(W + 0.14, plinthH, D + 0.14, 0, plinthH / 2, 0);
    remapUV(pl, W + 0.14, plinthH, D + 0.14, UV_BRICK);
    P('brick', pl);
    const cap = box(W + 0.20, 0.06, D + 0.20, 0, plinthH - 0.02, 0);
    remapUV(cap, W + 0.20, 0.06, D + 0.20, UV_BRICK);
    P('brick', cap);
  }

  /* ── 四面墙 ───────────────────────────────────────────────── */
  const front = wallWithHoles(W, wallH, WALL_T, frontHoles);
  front.translate(0, plinthH, -HD + WALL_T / 2);
  P(wallMatKey, front, wallTint());

  const back = wallWithHoles(W, wallH, WALL_T, backHoles);
  back.rotateY(Math.PI);
  back.translate(0, plinthH, HD - WALL_T / 2);
  P(wallMatKey, back, wallTint());

  const sideLen = Math.max(0.3, D - WALL_T * 2);
  const left = wallWithHoles(sideLen, wallH, WALL_T, []);
  left.rotateY(Math.PI / 2);
  left.translate(-HW + WALL_T / 2, plinthH, 0);
  P(wallMatKey, left, wallTint());

  const right = wallWithHoles(sideLen, wallH, WALL_T, []);
  right.rotateY(-Math.PI / 2);
  right.translate(HW - WALL_T / 2, plinthH, 0);
  P(wallMatKey, right, wallTint());

  /* 室内暗腔：门洞 / 窗洞看进去是暗的 */
  P('woodDark', box(
    Math.max(0.2, W - WALL_T * 2 - 0.02), Math.max(0.2, wallH - 0.03),
    Math.max(0.2, D - WALL_T * 2 - 0.02), 0, plinthH + wallH / 2, 0));

  /* ── 墙根返潮带 + 檐下水渍带（让墙面有上下层次）─────────── */
  {
    const dampH = 0.30, stainH = 0.24;
    const zf = -HD + WALL_T / 2, zb = HD - WALL_T / 2;
    const xs = -HW + WALL_T / 2, xe = HW - WALL_T / 2;
    /* 返潮带：下沿最深、向上渐隐到墙色（顶点色梯度）*/
    const db = (w, hh, d, x, y, z) => {
      const g = box(w, hh, d, x, y, z);
      remapUV(g, w, hh, d, UV_PLASTER);
      gradY(g, y - hh / 2, y + hh / 2, 0.52, 1.0);
      return g;
    };
    /* 檐下水渍：越靠檐口越脏（顶点色上深下浅）*/
    const sb = (w, hh, d, x, y, z) => {
      const g = box(w, hh, d, x, y, z);
      remapUV(g, w, hh, d, UV_PLASTER);
      gradY(g, y - hh / 2, y + hh / 2, 1.0, 0.60);
      return g;
    };
    P('damp', db(W, dampH, WALL_T + .008, 0, plinthH + dampH / 2, zf));
    P('damp', db(W, dampH, WALL_T + .008, 0, plinthH + dampH / 2, zb));
    P('damp', db(WALL_T + .008, dampH, D - WALL_T * 2, xs, plinthH + dampH / 2, 0));
    P('damp', db(WALL_T + .008, dampH, D - WALL_T * 2, xe, plinthH + dampH / 2, 0));
    P('damp', sb(W, stainH, WALL_T + .008, 0, wallTop - stainH / 2 - .02, zf));
    P('damp', sb(W, stainH, WALL_T + .008, 0, wallTop - stainH / 2 - .02, zb));
    P('damp', sb(WALL_T + .008, stainH, D - WALL_T * 2, xs, wallTop - stainH / 2 - .02, 0));
    P('damp', sb(WALL_T + .008, stainH, D - WALL_T * 2, xe, wallTop - stainH / 2 - .02, 0));
    /* 墙角返潮：四个竖角各一条竖向水渍 */
    const cornerH = 1.15, cw = 0.30;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        P('damp', db(cw, cornerH, WALL_T + .008, sx * (HW - cw / 2), plinthH + cornerH / 2, sz * (HD - WALL_T / 2)));
        P('damp', db(WALL_T + .008, cornerH, cw, sx * (HW - WALL_T / 2), plinthH + cornerH / 2, sz * (HD - cw / 2)));
      }
      /* 墙角竖向水痕：上淡下深 */
    }
  }

  /* ── 墙帽：砖线 + 挑檐小檐（檐口压顶）───────────────────── */
  {
    const cap = box(W + 0.14, 0.09, D + 0.14, 0, wallTop + 0.045, 0);
    remapUV(cap, W + 0.14, 0.09, D + 0.14, UV_BRICK);
    P('brick', cap);
    const eave = box(W + 0.30, 0.07, D + 0.56, 0, wallTop + 0.115, 0);
    remapUV(eave, W + 0.30, 0.07, D + 0.56, UV_PLASTER);
    P(tileKey, eave);
    /* 挑檐下的滴水（正面 + 背面各一排） */
    const n = Math.max(6, Math.round(W / .34));
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + W * (i + .5) / n;
        const drip = dripGeo(.05, .09);
        drip.translate(x, wallTop + 0.035, s * (D / 2 + 0.29));
        P(tileKey, drip);
      }
    }
  }

  /* 前脸角柱（木构色差） */
  for (const s of [-1, 1]) {
    P('woodDark', box(0.19, wallH, 0.19, s * (HW - 0.13), plinthH + wallH / 2, -HD + 0.095));
  }
  if (floors === 2) {
    const band = box(W + 0.18, 0.09, D + 0.18, 0, plinthH + storyH + 0.045, 0);
    remapUV(band, W + 0.18, 0.09, D + 0.18, UV_PLASTER);
    P(tileKey, band);
  }

  /* ── 木板门：门框 + 门板 + 门簪 + 门环 + 门槛石 + 抱鼓石 ── */
  {
    const dg = doorGeo2(dw, dh);
    dg.rotateY(Math.PI);
    dg.translate(doorU, plinthH, -HD + 0.10);
    P(isShrine ? 'woodRed' : 'wood', dg);
    /* 门框（退进洞里，颜色比门板浅一点 → 看得出层次） */
    P('woodDark', box(0.11, dh + 0.16, WALL_T + .05, doorU - dw / 2 - 0.055, plinthH + (dh + 0.16) / 2, -HD + WALL_T / 2));
    P('woodDark', box(0.11, dh + 0.16, WALL_T + .05, doorU + dw / 2 + 0.055, plinthH + (dh + 0.16) / 2, -HD + WALL_T / 2));
    P('woodDark', box(dw + 0.25, 0.13, WALL_T + .05, doorU, plinthH + dh + 0.08, -HD + WALL_T / 2));
    /* 门环（铜） */
    for (const s of [-1, 1]) {
      const ring = new THREE.TorusGeometry(.075, .017, 5, 10);
      ring.translate(doorU + s * dw * 0.24, plinthH + dh * 0.52, -HD + 0.05);
      P('gold', ring);
    }
    /* 门槛石 */
    P('stone', box(dw + 0.30, 0.09, WALL_T + 0.16, doorU, plinthH - 0.045, -HD + WALL_T / 2));
    /* 抱鼓石 */
    for (const s of [-1, 1]) {
      const bx = doorU + s * (dw / 2 + 0.26);
      P('stone', cyl(.15, .17, .26, 8, bx, 0.13, -HD - 0.10));
      P('stone', cyl(.16, .16, .045, 8, bx, 0.28, -HD - 0.10));
      P('stone', box(.34, .07, .30, bx, 0.035, -HD - 0.10));
    }
  }

  /* ── 木格窗：窗框退进洞里，窗纸更靠内透暖光 ─────────────── */
  for (const win of frontWins) {
    const f = windowGeo(win.w, win.h);
    f.translate(win.u, plinthH + win.v, -HD);
    P('wood', f);
    /* 窗纸退进洞里 11cm，透出暖光（夜里是亮的）*/
    P('paperWin', box(win.w - 0.02, win.h - 0.02, 0.03, win.u, plinthH + win.v + win.h / 2, -HD + 0.11));
    /* 窗台（石） */
    P('stone', box(win.w + 0.26, 0.06, 0.22, win.u, plinthH + win.v - 0.04, -HD + 0.02));
  }
  for (const win of backWins) {
    const f = windowGeo(win.w, win.h);
    f.rotateY(Math.PI);
    f.translate(win.u, plinthH + win.v, HD);
    P('wood', f);
    P('paperWin', box(win.w - 0.02, win.h - 0.02, 0.03, win.u, plinthH + win.v + win.h / 2, HD - 0.11));
    P('stone', box(win.w + 0.26, 0.06, 0.22, win.u, plinthH + win.v - 0.04, HD - 0.02));
  }

  /* ── 门前石阶（2 级）+ 墙根散石 ─────────────────────────── */
  if (isGran) {
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 3;
      P('stone', box(dw + 0.40 - i * 0.09, plinthH * t, 0.32, doorU, plinthH * t / 2, -HD - 0.16 - i * 0.32));
    }
  } else {
    P('stone', box(dw + 0.50, plinthH, 0.36, doorU, plinthH / 2, -HD - 0.18));
    P('stone', box(dw + 0.78, plinthH * 0.5, 0.36, doorU, plinthH * 0.25, -HD - 0.54));
  }

  const nRock = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < nRock; i++) {
    const s = 0.10 + rng() * 0.15;
    const side = Math.floor(rng() * 4);
    let rx = 0, rz = 0;
    if (side === 0) { rx = (rng() - .5) * W * 0.94; rz = -HD - 0.16 - rng() * 0.24; }
    else if (side === 1) { rx = (rng() - .5) * W * 0.94; rz = HD + 0.16 + rng() * 0.24; }
    else if (side === 2) { rx = -HW - 0.16 - rng() * 0.24; rz = (rng() - .5) * D * 0.94; }
    else { rx = HW + 0.16 + rng() * 0.24; rz = (rng() - .5) * D * 0.94; }
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(1, 0.5 + rng() * 0.35, 1);
    g.rotateY(rng() * 6.28);
    g.rotateZ((rng() - .5) * 0.45);
    g.translate(rx, s * 0.26, rz);
    P('rock', g);
  }

  /* ── 屋顶 ─────────────────────────────────────────────────── */
  const roof = roofGeo(W, D, roofH, {
    over, courses: isGran ? 6 : 4,
    curve: isGran ? 0.14 : 0.24,
    pitch: isGran ? 0.30 : 0.22,
    amp: isGran ? 0.03 : 0.045,
    gableOut: GABLE_T,
  });
  for (const g of roof.tile) { g.translate(0, roofBase, 0); P(isGran ? 'thatch' : tileKey, g); }
  for (const g of roof.ridge) { g.translate(0, roofBase, 0); P(isGran ? 'thatch' : 'tileDark', g); }
  for (const g of roof.soffit) { g.translate(0, roofBase, 0); P('woodDark', g); }

  /* ── 马头墙（左右山墙）：阶梯体 + 压顶瓦 + 悬鱼 ───────────── */
  {
    const gw = gableWall(D, roofH, { over, curve: isGran ? 0.14 : 0.24, base: roofBase });
    const xc = HW + GABLE_T / 2;
    for (const sx of [-1, 1]) {
      /* 用旋转（不是镜像）换边，镜像会把面绕序翻掉 → 背面被剔除 */
      const panel = gw.panel.clone();
      if (sx > 0) { panel.rotateY(Math.PI / 2); panel.translate(HW, 0, 0); }
      else { panel.rotateY(-Math.PI / 2); panel.translate(-(HW + GABLE_T), 0, 0); }
      P(wallMatKey, panel, wallTint());
      for (const c of gw.caps) {
        const g = c.clone();
        g.translate(sx * xc, 0, 0);
        P(isGran ? 'thatch' : tileKey, g);
      }
      /* 山墙自己的砖勒脚 + 墙根返潮（山墙比房身宽，勒脚要跟出去） */
      const gpl = box(GABLE_T + 0.20, plinthH, D + 0.14, 0, plinthH / 2, 0);
      remapUV(gpl, GABLE_T + 0.20, plinthH, D + 0.14, UV_BRICK);
      gpl.translate(sx * (HW + GABLE_T / 2 + 0.05), 0, 0);
      P('brick', gpl);
      const gdb = box(GABLE_T + 0.012, 0.34, D - 0.10, 0, plinthH + 0.17, 0);
      remapUV(gdb, GABLE_T + 0.012, 0.34, D - 0.10, UV_PLASTER);
      gradY(gdb, plinthH, plinthH + 0.34, 0.52, 1.0);
      gdb.translate(sx * (HW + GABLE_T / 2), 0, 0);
      P('damp', gdb);
      /* 腰檐：檐口高度上一道瓦檐，把大白墙断成两截 */
      const gcap = box(GABLE_T + 0.24, 0.11, D + 0.30, 0, wallTop + 0.055, 0);
      remapUV(gcap, GABLE_T + 0.24, 0.11, D + 0.30, UV_PLASTER);
      gcap.translate(sx * (HW + GABLE_T / 2 + 0.05), 0, 0);
      P(tileKey, gcap);
      /* 二层腰线：楼层交界上一道砖线 */
      if (floors === 2) {
        const gb = box(GABLE_T + 0.14, 0.08, D - 0.06, 0, plinthH + storyH + 0.04, 0);
        remapUV(gb, GABLE_T + 0.14, 0.08, D - 0.06, UV_BRICK);
        gb.translate(sx * (HW + GABLE_T / 2 + 0.02), 0, 0);
        P('brick', gb);
      }
      /* 悬鱼：挂在山墙中央（朝外的面） */
      const xy = xuanYuGeo();
      xy.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2);
      xy.translate(sx * (HW + GABLE_T + 0.03), gw.H0 - 0.20, 0);
      P('woodDark', xy);
    }
  }

  /* ── 二层挑台 + 栏杆 ──────────────────────────────────────── */
  if (floors === 2) {
    const bw = Math.min(W * 0.76, 3.2);
    const ry = plinthH + storyH + 0.10;
    P('wood', box(bw, 0.10, 0.38, 0, ry - 0.05, -HD - 0.19));
    P('wood', box(bw, 0.07, 0.08, 0, ry + 0.82, -HD - 0.34));
    P('wood', box(bw, 0.05, 0.07, 0, ry + 0.14, -HD - 0.34));
    const n = Math.max(6, Math.round(bw / 0.26));
    for (let i = 0; i <= n; i++) {
      const x = -bw / 2 + bw * i / n;
      P('wood', box(0.05, 0.78, 0.05, x, ry + 0.40, -HD - 0.34));
    }
    for (const s of [-1, 1]) {
      P('wood', box(0.08, 0.07, 0.34, s * bw / 2, ry + 0.82, -HD - 0.18));
      P('wood', box(0.05, 0.78, 0.05, s * bw / 2, ry + 0.40, -HD - 0.18));
    }
  }

  /* ── 门头披檐 ─────────────────────────────────────────────── */
  if (style >= 2 || isRich) {
    const pw = dw + 0.65, pd = 0.95;
    const g = box(pw, 0.08, pd);
    g.rotateX(-0.30);
    g.translate(doorU, plinthH + dh + 0.26, -HD - 0.34);
    P(tileKey, g);
    P('wood', box(0.08, 0.10, 0.62, doorU - pw / 2 + 0.15, plinthH + dh + 0.03, -HD - 0.12));
    P('wood', box(0.08, 0.10, 0.62, doorU + pw / 2 - 0.15, plinthH + dh + 0.03, -HD - 0.12));
  }

  /* ── 富户：院门楼 + 院墙 ──────────────────────────────────── */
  if (isRich || style === 3) {
    const gz = -HD - 0.58;
    const gw = dw + 1.05;
    P('woodRed', box(0.17, 2.25, 0.17, doorU - gw / 2, 1.125, gz));
    P('woodRed', box(0.17, 2.25, 0.17, doorU + gw / 2, 1.125, gz));
    P('woodRed', box(gw + 0.40, 0.18, 0.22, doorU, 2.30, gz));
    const gr = roofGeo(gw * 0.52, 0.72, 0.36, { over: .20, curve: .18, courses: 2, pitch: .18, amp: .03, gableOut: .1 });
    for (const g of gr.tile) { g.translate(doorU, 2.39, gz); P(tileKey, g); }
    for (const g of gr.ridge) { g.translate(doorU, 2.39, gz); P('tileDark', g); }
    for (const g of gr.soffit) { g.translate(doorU, 2.39, gz); P('woodDark', g); }
    const gd = doorGeo2(dw * 0.90, 1.70);
    gd.rotateY(Math.PI);
    gd.translate(doorU, 0, gz);
    P('woodDark', gd);
    for (const s of [-1, 1]) {
      const wx = doorU + s * (gw / 2 + 0.24 + 0.62);
      P(wallKey, box(1.24, 0.95, 0.17, wx, 0.475, gz), wallTint());
      const cc = box(1.34, 0.09, 0.26, wx, 1.00, gz);
      remapUV(cc, 1.34, 0.09, 0.26, UV_PLASTER);
      P(tileKey, cc);
    }
  }

  /* ── 小庙：匾额 + 供桌 + 香炉 + 山门 ─────────────────────── */
  if (isShrine) {
    const pw = dw * 1.7;
    P('woodRed', box(pw, 0.40, 0.06, doorU, plinthH + dh + 0.40, -HD - 0.04));
    P('gold', box(pw - 0.14, 0.27, 0.02, doorU, plinthH + dh + 0.40, -HD - 0.08));

    const tx = doorU + dw / 2 + 0.68;
    const tz = -HD - 0.78;
    P('stone', box(1.10, 0.14, 0.62, tx, 0.07, tz));
    P('wood', box(0.94, 0.08, 0.50, tx, 0.83, tz));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P('wood', box(0.07, 0.72, 0.07, tx + sx * 0.40, 0.46, tz + sz * 0.18));
    }
    P('gold', cyl(0.16, 0.12, 0.16, 12, tx, 0.95, tz));
    P('gold', cyl(0.17, 0.17, 0.03, 12, tx, 1.04, tz));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * 6.283;
      P('gold', cyl(0.024, 0.024, 0.05, 6, tx + Math.cos(a) * 0.10, 1.045, tz + Math.sin(a) * 0.10));
    }
    P('woodRed', cyl(0.034, 0.034, 0.22, 8, tx - 0.30, 0.98, tz));
    P('woodRed', cyl(0.034, 0.034, 0.22, 8, tx + 0.30, 0.98, tz));

    const mz = -HD - 0.66;
    P('stone', box(0.22, 2.05, 0.22, doorU - 0.60, 1.025, mz));
    P('stone', box(0.22, 2.05, 0.22, doorU + 0.60, 1.025, mz));
    P('woodRed', box(1.58, 0.17, 0.22, doorU, 2.10, mz));
    const mr = roofGeo(1.42, 0.72, 0.30, { over: .18, curve: .18, courses: 2, pitch: .18, amp: .03, gableOut: .08 });
    for (const g of mr.tile) { g.translate(doorU, 2.19, mz); P(tileKey, g); }
    for (const g of mr.ridge) { g.translate(doorU, 2.19, mz); P('tileDark', g); }
    for (const g of mr.soffit) { g.translate(doorU, 2.19, mz); P('woodDark', g); }
    P('gold', box(0.52, 0.22, 0.03, doorU, 1.84, mz - 0.13));
  }

  /* ── 粮仓：通风格栅 ───────────────────────────────────────── */
  if (isGran) {
    const gv = dh + 0.26;                       // 门楣之上
    const gh = 0.38, gwid = Math.min(0.72, W * 0.26);
    for (const s of [-1, 1]) {
      const z = s * (HD - 0.02);
      P('wood', box(gwid + 0.12, 0.055, 0.11, 0, plinthH + gv, z));
      P('wood', box(gwid + 0.12, 0.055, 0.11, 0, plinthH + gv + gh, z));
      for (let i = 0; i < 4; i++) {
        P('wood', box(gwid, 0.055, 0.08, 0, plinthH + gv + 0.08 + i * 0.08, z - s * 0.03));
      }
    }
  }

  /* ── 接地阴影：房脚一圈 + 四角加强 ───────────────────────── */
  aoPts.push({
    x: h.x || 0, z: h.z || 0,
    r: Math.max(W, D) * 0.62 + 1.5, s: 0.45,
  });
  {
    const ct = Math.cos(theta), st = Math.sin(theta);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = sx * (HW + 0.25), lz = sz * (HD + 0.25);
      aoPts.push({
        x: (h.x || 0) + lx * ct + lz * st,
        z: (h.z || 0) - lx * st + lz * ct,
        r: 1.75, s: 0.38,
      });
    }
  }

  /* ── 烟囱：位置对齐 core/effects.js 的炊烟烟柱 ───────────── */
  if (smoke) {
    const wx = smoke.x - (h.x || 0), wz = smoke.z - (h.z || 0);
    const ct = Math.cos(theta), st = Math.sin(theta);
    /* 世界 → 房屋本地 */
    let lx = wx * ct - wz * st;
    let lz = wx * st + wz * ct;
    lz = Math.max(-0.40, Math.min(0.40, lz));   /* 贴到屋脊上 */
    const rdHalf = (D + 2 * over) / 2;
    const ySurf = roofBase + roofH * (1 - Math.abs(lz) / rdHalf);
    const top = Math.max(smoke.y + 0.15, ySurf + 0.02);
    const base = ySurf - 0.40;
    const ch = box(0.34, top - base, 0.34, lx, (top + base) / 2, lz);
    remapUV(ch, 0.34, top - base, 0.34, UV_BRICK);
    P('brick', ch);
    const cap = box(0.48, 0.09, 0.48, lx, top + 0.045, lz);
    remapUV(cap, 0.48, 0.09, 0.48, UV_BRICK);
    P('tileDark', cap);
    chimneyList.push({ house: idx, x: smoke.x, z: smoke.z, smokeY: smoke.y, chimneyTop: top, lx, lz });
  }
}

/* ══════════════════════════════════════════════════════════════
   入口
   ══════════════════════════════════════════════════════════════ */
export function build(layout) {
  initMaterials();
  const HM = houseMats();
  const group = new THREE.Group();
  group.name = 'model-houses';

  const baseSeed = ((Number(layout && layout.seed) | 0) ^ 0x11) | 0;
  const cell = (layout && layout.cell) || CELL_FALLBACK;
  const houses = (layout && layout.houses) || [];
  const buckets = new Map();
  const aoPts = [];
  const chimneyList = [];
  const smokes = smokePicks(layout);

  for (let i = 0; i < houses.length; i++) {
    buildHouse(houses[i], i, buckets, baseSeed, cell, aoPts, smokes.get(i) || null, chimneyList);
  }

  /* 自建材质优先，其余走 core 的 MAT */
  const matOf = (key) => HM[key] || MAT[key];

  for (const [key, list] of buckets) {
    if (!list.length) continue;
    const mat = matOf(key);
    if (!mat) continue;
    const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!g) continue;
    /* 瓦/木面里有一批自建小件法线朝下，那部分完全不受光 → 屋顶像一块纯黑。
       合并后统一修一次。 */
    fixUpNormals(g);
    const m = new THREE.Mesh(g, mat);
    m.name = 'houses-' + key;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  /* ── 接地阴影：整批合一个 draw call ─────────────────────── */
  if (aoPts.length) {
    const patch = aoPatch(1, 0.45);           // 复用 ao.js 的共享材质（含径向贴图）
    const mat = patch.material;
    const geos = aoBatch(aoPts, mat);
    if (geos.length) {
      const g = mergeGeometries(geos.map(nonIndexed), false);
      const m = new THREE.Mesh(g, mat);
      m.name = 'houses-ao';
      m.renderOrder = 2;
      m.frustumCulled = false;
      group.add(m);
    }
  }

  group.userData.houseCount = houses.length;
  group.userData.meshCount = group.children.length;
  /* 烟囱坐标清单（对齐 core/effects.js 的炊烟）*/
  group.userData.chimneys = chimneyList;
  return group;
}
