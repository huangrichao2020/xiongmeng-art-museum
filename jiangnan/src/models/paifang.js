/* 江南古村 · 牌坊（四柱三间冲天式）
   ------------------------------------------------------------------
   形制：冲天式（冲天牌坊）——柱头冲出额枋之上，没有屋顶；
         四柱三间，中柱高、边柱矮；额枋 + 雀替 + 斗栱 + 小挑檐，
         中间一间挂匾额（黑漆板 + 金字）。
   尺度：柱列总跨度 9.0m（中跨净宽 3.6m，主街 3.4m 正好从中间过）
         石柱础（须弥座式）0.56m；边柱柱头 5.24m、中柱柱头 5.35m
         小额枋 4.10–4.36、大额枋 4.50–4.88、斗栱 4.88–5.24
         柱顶出头段：边柱 0.80m、中柱 1.00m → 总高 6.35m
   朝向：rot = 牌坊正面方向，group.rotation.y = rot；
         柱列横跨在垂直 rot 的轴上（正面朝局部 +Z）
   材质：MAT.stone / MAT.stoneDark / MAT.wood / MAT.woodDark / MAT.gold
         匾额文字用 canvas 贴图（黑漆底 + 金字 + 题款），夜里微微发亮
   draw call：每座 4 个 mesh（石 4 / 木 4），同村两座共 8
   随机性：只用 makeRng(seed ^ 0x9a3f)，不用 Math.random */
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { MAT, initMaterials } from '../core/materials.js';
import { mergeGeometries, meshOf, nonIndexed } from '../core/geo.js';
import { aoPatch, aoBatch } from '../core/ao.js';

/* ── 尺寸常量 ─────────────────────────────────────────────── */
const SPAN = 9.00;                       // 外柱中心距（总跨度）
const COL_X = [-4.50, -1.80, 1.80, 4.50]; // 四根柱子的横向位置（中间跨更宽）
const BASE_STONE = 0.56;                 // 须弥座式柱础顶标高
const BASE_WOOD = 0.42;                  // 木牌坊柱础石顶标高
const LINTEL_LO = 4.10;                  // 小额枋底
const LINTEL_HI = 4.50;                  // 大额枋底
const DOUGONG_Y = 4.88;                  // 斗栱层底（= 大额枋顶）
const COL_TOP_OUT = 5.24;                // 边柱柱头（柱身顶）
const COL_TOP_IN = 5.35;                 // 中柱柱头（柱身顶）
const HEAD_OUT = 0.80;                   // 边柱柱顶出头段
const HEAD_IN = 1.00;                    // 中柱柱顶出头段
const PLAQUE_Y = 3.40;                   // 匾额中心高
const PW = 2.44, PH = 0.88;              // 匾板（漆板）尺寸
const TW = 2.30, TH = 0.74;              // 匾面（字）尺寸
const S_STONE = 13.44;                   // 石贴图按真实尺度铺
const S_WOOD = 2.40;                     // 木纹按真实尺度铺

/* ── 几何小工具 ───────────────────────────────────────────── */
function boxG(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
/* 带旋转的盒子：先转再挪，转的是自身中心 */
function boxR(w, h, d, rx, ry, rz, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
/* 盒子 UV 按真实尺寸铺（长枋不会把石纹拉成条纹） */
function boxUV(g, w, h, d, S) {
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
      let u, v;
      if (f === 0 || f === 1) { u = lz; v = ly; }        // ±X 面
      else if (f === 2 || f === 3) { u = lx; v = lz; }   // ±Y 面
      else { u = lx; v = ly; }                          // ±Z 面
      uv.setXY(i, u / S, v / S);
    }
  }
  uv.needsUpdate = true;
  return g;
}
/* 石/木盒子：按真实尺度铺贴图后摆位 */
function slabG(w, h, d, x, y, z, S) {
  const g = new THREE.BoxGeometry(w, h, d);
  boxUV(g, w, h, d, S);
  g.translate(x, y, z);
  return g;
}
function cylG(rTop, rBot, h, x, y, z, seg = 12) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
  g.translate(x, y, z);
  return g;
}
/* 带旋转的圆柱：先转再挪（椽子要顺着坡向躺） */
function cylR(r, h, rx, x, y, z, seg = 8) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}
/* 方柱带收分：4 段圆柱转 45° 即得方柱（上细下粗） */
function shaftG(hwBot, hwTop, h, y0, x) {
  const g = new THREE.CylinderGeometry(hwTop * Math.SQRT2, hwBot * Math.SQRT2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(x, y0 + h / 2, 0);
  return g;
}
function roundShaftG(rBot, rTop, h, y0, x) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 14, 1);
  g.translate(x, y0 + h / 2, 0);
  return g;
}

/* ── 顶点色明暗 ───────────────────────────────────────────────
   朝上的面吃天光更亮、朝下更暗；再加上高度渐变。
   这一层让"均匀的木头 / 均匀的石头"变成有体积的构件。 */
function shade(g, opt = {}) {
  const p = g.attributes.position, nrm = g.attributes.normal;
  const n = p.count;
  const col = new Float32Array(n * 3);
  const y0 = opt.y0 ?? 0, y1 = opt.y1 ?? 1;
  const s0 = opt.s0 ?? .86, s1 = opt.s1 ?? 1.08;
  const up = opt.up ?? .18, jit = opt.jit ?? .05;
  const tone = opt.tone ?? 1;             // 整件色调档（基座深/柱身中/雕饰浅）
  const grain = opt.grain ?? 0;           // 木纹色带
  const gmode = opt.grainMode ?? 'auto';
  /* 整件包围盒：木纹绕着"这件东西自己的轴"转 */
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, yb0 = 1e9, yb1 = -1e9;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
    if (y < yb0) yb0 = y; if (y > yb1) yb1 = y;
  }
  const cx = (x0 + x1) * .5, cz = (z0 + z1) * .5;
  const alongX = (x1 - x0) >= (z1 - z0);
  const vertical = (yb1 - yb0) > Math.max(x1 - x0, z1 - z0);
  const useV = gmode === 'auto' ? vertical : (gmode === 'v');
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let t = (y - y0) / Math.max(1e-4, y1 - y0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    let k = s0 + (s1 - s0) * t;
    if (nrm) k *= 1 + up * nrm.getY(i);
    if (jit) {
      const v = 0.5 + 0.5 * Math.sin(x * 2.3 + z * 1.7 + y * 0.9) * Math.cos(z * 2.1 - y * 1.3);
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
   方向场只跟位置有关 → 相邻面公共顶点位移一致，不会裂开；
   位移在件的上下端收为 0 → 上下层构件仍然严丝合缝地叠着。 */
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
    const fade = Math.min(1, 5 * Math.min(ty, 1 - ty));
    const k = (nv / 1.55) * amp * fade;
    p.setXYZ(i, x + dx / L * k, y + dy / L * k, z + dz / L * k);
  }
  g.computeVertexNormals();
  return g;
}
/* 平面投影 UV：按顶点法线挑投影面，贴图按真实尺度铺 */
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
/* 上细下粗：绕件自己的轴缩放 */
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
    const sc = 1 - (1 - k) * t;
    p.setXYZ(i, cx + (p.getX(i) - cx) * sc, y, cz + (p.getZ(i) - cz) * sc);
  }
  g.computeVertexNormals();
  return g;
}
/* 细分石盒：凿过的粗石面 + 真实尺度 UV */
function slabC(w, h, d, x, y, z, S, seg = 3, amp = 0.016) {
  const g = new THREE.BoxGeometry(w, h, d, seg, Math.max(1, seg >> 1), seg);
  g.translate(x, y, z);
  planarUV(g, S);
  return chisel(g, amp);
}
/* 方柱：收分（上细下粗）+ 凿痕 */
function colG(hwBot, hwTop, h, y0, x, S, seg = 3, amp = 0.014) {
  const g = new THREE.BoxGeometry(2 * hwBot, h, 2 * hwBot, seg, Math.max(2, seg * 2), seg);
  g.translate(x, y0 + h / 2, 0);
  planarUV(g, S);
  taperY(g, hwTop / hwBot);
  return chisel(g, amp);
}
/* 材质克隆：统一开 vertexColors，不动共享材质 */
function matClone(base, over = {}) {
  const m = base.clone();
  for (const k in over) {
    if (k === 'color' || k === 'emissive') {
      /* color 可以给 [r,g,b]（线性值，允许 >1）：贴图本身已经带深色，
         再乘一个深色，木头就黑成一根焦炭 */
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
   牌坊是四根柱子"硬边站在草地上"，最像贴纸。
   柱子脚下一圈软影 + 牌坊整体一片淡影，合成一个 mesh，只多 1 个 draw call。 */
let _aoMat = null;
function aoMaterial() {
  if (_aoMat) return _aoMat;
  const src = aoPatch(1, .5).material;
  _aoMat = new THREE.MeshBasicMaterial({
    map: src.map, transparent: true, depthWrite: false,
    blending: THREE.MultiplyBlending, vertexColors: true,
    side: THREE.FrontSide, toneMapped: false,
  });
  _aoMat.name = 'mat-paifang-ao';
  return _aoMat;
}
function aoDisc(x, z, r, s, y = 0.02) {
  const g = new THREE.CircleGeometry(1, 22);
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

/* ── 小披檐的瓦顶 ─────────────────────────────────────────────
   两坡瓦垄 + 正脊 + 垂脊 + 脊头吻兽。
   没有正脊的瓦顶就是"一块斜板"，有了正脊才叫"瓦顶"。 */
function tileRoof(P, w, yRidge, yEave, zEave, matK, darkK, S) {
  const run = Math.abs(zEave);
  const dy = yRidge - yEave;
  const len = Math.hypot(run, dy);
  const ang = Math.atan2(dy, run);
  for (const sz of [-1, 1]) {
    const rx = sz * Math.PI / 2 + ang;                 // 圆柱轴向 = 坡向
    const nY = Math.cos(ang), nZ = sz * Math.sin(ang); // 坡面法线
    const n = Math.max(8, Math.round(w / 0.17));
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + w * (k + 0.5) / n;
      const g = new THREE.CylinderGeometry(0.055, 0.055, len, 7, 1);
      g.rotateX(rx);
      g.translate(x, (yRidge + yEave) / 2 + nY * 0.05, sz * run / 2 + nZ * 0.05);
      P(matK, g);
    }
    /* 垂脊：两端沿坡面下来 */
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.15, 0.14, len);
      g.rotateX(rx);
      g.translate(sx * (w / 2 - 0.02), (yRidge + yEave) / 2 + nY * 0.10, sz * run / 2 + nZ * 0.10);
      P(darkK, g);
    }
  }
  /* 正脊（压在两坡交线上）+ 脊面 */
  P(darkK, slabG(w + 0.06, 0.16, 0.30, 0, yRidge + 0.09, 0, S));
  P(matK, slabG(w + 0.22, 0.05, 0.42, 0, yRidge + 0.185, 0, S));
  /* 脊头吻兽 */
  for (const sx of [-1, 1]) {
    P(darkK, boxR(0.17, 0.28, 0.17, 0, 0, sx * 0.24, sx * (w / 2 + 0.02), yRidge + 0.30, 0));
    P(darkK, boxR(0.10, 0.12, 0.24, 0, 0, sx * 0.5, sx * (w / 2 - 0.06), yRidge + 0.24, 0));
  }
}

/* ── 匾额：canvas 贴图（黑漆底 + 金字 + 题款） ─────────────── */
function plaqueTex(text) {
  const W = 640, H = 210;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  /* 底：黑漆，带一点纵向高光 */
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#2c2118');
  grd.addColorStop(.45, '#1c140e');
  grd.addColorStop(1, '#281d15');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);

  /* 内框（描金） */
  g.strokeStyle = '#b08c3c'; g.lineWidth = 5; g.strokeRect(11, 11, W - 22, H - 22);
  g.strokeStyle = 'rgba(176,140,60,.42)'; g.lineWidth = 2; g.strokeRect(21, 21, W - 42, H - 42);

  /* 题款（小字竖排，两边各一列） */
  if (text.length <= 3) {
    g.fillStyle = 'rgba(198,160,74,.62)';
    g.font = '19px "Songti SC","STSong","SimSun",serif';
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText('古村', 46, 58);
    g.fillText('重立', 46, 116);
    g.fillText('乡贤', W - 46, 58);
    g.fillText('同敬', W - 46, 116);
  }

  /* 正题 */
  const fs = Math.min(126, (W - (text.length <= 3 ? 200 : 90)) / text.length);
  g.fillStyle = '#e9c976';
  g.shadowColor = 'rgba(255,214,130,.55)';
  g.shadowBlur = 10;
  g.font = `bold ${fs}px "Songti SC","STSong","SimSun",serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2 + 6);
  g.shadowBlur = 0;

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function plaqueMat(text) {
  const t = plaqueTex(text);
  return new THREE.MeshStandardMaterial({
    map: t, color: 0xffffff, roughness: .55, metalness: .30,
    emissive: 0xffc978, emissiveMap: t, emissiveIntensity: .38,
  });
}
/* 匾面：正面（+Z）与背面（-Z）两片，UV 各自摆正，合成一个 mesh */
function plaqueFaceGeo() {
  const front = new THREE.PlaneGeometry(TW, TH);
  front.translate(0, PLAQUE_Y, 0.058);
  const back = new THREE.PlaneGeometry(TW, TH);
  back.rotateY(Math.PI);
  back.translate(0, PLAQUE_Y, -0.058);
  return mergeGeometries([nonIndexed(front), nonIndexed(back)], false);
}

/* ── 一座牌坊 ─────────────────────────────────────────────── */
/* kind: 'stone' | 'wood'；返回合批后的 mesh 数组 */
function buildOne(kind, text) {
  const G = { stone: [], dark: [], wood: [], woodDark: [], gold: [], paint: [], tile: [] };
  /* tone：整件色调档 —— 石件分「基座深 / 柱身中 / 雕饰浅」三档。
     档位记在件上，合批前逐件写进顶点色。 */
  const TONE = new Map();
  const P = (k, g, tone = 1) => { G[k].push(g); TONE.set(g, tone); }
  const isStone = (kind === 'stone');
  const baseTop = isStone ? BASE_STONE : BASE_WOOD;
  const S = isStone ? S_STONE : S_WOOD;

  /* ═══ 1. 四根柱 ═══════════════════════════════════════ */
  for (let i = 0; i < 4; i++) {
    const cx = COL_X[i];
    const inner = (i === 1 || i === 2);
    const colTop = inner ? COL_TOP_IN : COL_TOP_OUT;
    const headH = inner ? HEAD_IN : HEAD_OUT;

    if (isStone) {
      /* 柱础：须弥座式（圭角 — 束腰 — 上枋） */
      P('stone', slabC(0.96, 0.22, 0.96, cx, 0.11, 0, S, 3, 0.018), 0.80);   // 圭角（基座深）
      P('stone', slabC(0.74, 0.18, 0.74, cx, 0.31, 0, S, 3, 0.014), 1.06);
      P('stone', slabG(0.78, 0.06, 0.78, cx, 0.40, 0, S), 1.26);            // 束腰雕花带（雕饰浅）
      P('stone', slabC(0.88, 0.16, 0.88, cx, 0.48, 0, S, 3, 0.014), 1.12);
      /* 柱身（收分 + 凿痕） */
      P('stone', colG(0.30, 0.25, colTop - baseTop, baseTop, cx, S), 1.00);  // 柱身中
      /* 柱身分节刻线 */
      for (const y of [2.20, 3.45]) {
        const t = (y - baseTop) / (colTop - baseTop);
        const hw = 0.30 + (0.25 - 0.30) * t + 0.02;
        P('dark', shaftG(hw, hw, 0.06, y - 0.03, cx), 0.88);
      }
    } else {
      /* 木牌坊：方础石 + 覆盆 */
      P('stone', slabC(0.80, 0.30, 0.80, cx, 0.15, 0, S_STONE, 3, 0.018), 0.80);  // 方础（基座深）
      P('stone', cylG(0.30, 0.36, 0.12, cx, 0.36, 0, 14), 1.10);                  // 覆盆
      /* 木柱身（收分 + 木纹） */
      P('wood', roundShaftG(0.28, 0.235, colTop - baseTop, baseTop, cx), 1.00);
      /* 柱箍（深色，与柱身有色差） */
      for (const y of [1.55, 2.85, 4.05]) {
        const t = (y - baseTop) / (colTop - baseTop);
        const rr = 0.28 + (0.235 - 0.28) * t + 0.025;
        P('woodDark', cylG(rr, rr, 0.11, cx, y, 0, 14), 0.92);
      }
    }

    /* 柱顶出头段：仰莲 — 束带 — 方斗 — 栱 — 檐板 — 顶石 */
    const s = headH;
    if (isStone) {
      P('stone', slabG(0.62, 0.30 * s, 0.62, cx, colTop + 0.15 * s, 0, S));
      P('dark', slabG(0.66, 0.08 * s, 0.66, cx, colTop + 0.34 * s, 0, S));
      P('stone', slabG(0.58, 0.24 * s, 0.58, cx, colTop + 0.50 * s, 0, S));
      P('stone', slabG(1.02, 0.13 * s, 0.30, cx, colTop + 0.68 * s, 0, S));
      P('stone', slabG(0.90, 0.10 * s, 0.90, cx, colTop + 0.80 * s, 0, S));
      P('stone', slabG(0.46, 0.18 * s, 0.46, cx, colTop + 0.92 * s, 0, S));
    } else {
      P('wood', cylG(0.28, 0.34, 0.30 * s, cx, colTop + 0.15 * s, 0, 14), 1.00);      // 仰莲
      P('woodDark', cylG(0.32, 0.32, 0.08 * s, cx, colTop + 0.34 * s, 0, 14), 0.92);  // 束带
      P('wood', slabG(0.56, 0.24 * s, 0.56, cx, colTop + 0.50 * s, 0, S), 1.02);      // 方斗
      P('woodDark', slabG(1.08, 0.12 * s, 0.32, cx, colTop + 0.68 * s, 0, S), 0.90);  // 栱（深色分隔）
      P('wood', slabG(1.16, 0.09 * s, 1.02, cx, colTop + 0.80 * s, 0, S), 1.06);      // 檐板（薄而宽）
      P('stone', slabG(0.46, 0.18 * s, 0.46, cx, colTop + 0.92 * s, 0, S_STONE), 1.00);
    }
    /* 檐板四角起翘 */
    const wy = colTop + 0.80 * s, ww = isStone ? 0.90 : 0.88;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P(isStone ? 'stone' : 'wood',
        boxR(0.20, 0.09, 0.20, sz * 0.22, 0, -sx * 0.22,
          cx + sx * (ww / 2 - 0.08), wy, sz * (ww / 2 - 0.08)));
    }

    /* 斗栱层：栱（横）+ 斗 + 升 */
    P(isStone ? 'stone' : 'wood', slabG(1.10, 0.18, 0.30, cx, DOUGONG_Y + 0.09, 0, S));
    P(isStone ? 'dark' : 'woodDark', slabG(0.30, 0.14, 0.30, cx, DOUGONG_Y + 0.23, 0, S));
    P(isStone ? 'dark' : 'woodDark', slabG(0.28, 0.08, 0.28, cx, DOUGONG_Y + 0.32, 0, S));

    /* ── 戗柱：斜撑在柱侧，顶住额枋 ──
       冲天式牌坊没有屋顶，柱子全靠自身站住；戗柱就是那根"斜着站"的撑杆，
       没有它，四根光柱挑着两枋，怎么看都像搭起来的积木。 */
    {
      const foot = 0.66, top = 3.52;          // 戗柱脚的横向外挑 / 顶到的高度
      const dx = foot - 0.06, dy = top - 0.12;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dx, dy);
      for (const sx of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.15, len, 0.15);
        g.rotateZ(sx * ang);
        g.translate(cx + sx * (foot + 0.06) / 2, 0.12 + dy / 2, 0);
        P(isStone ? 'stone' : 'wood', g);
        /* 戗柱脚的小石础 */
        P('stone', slabC(0.42, 0.22, 0.42, cx + sx * foot, 0.11, 0, S_STONE, 2, 0.014), 0.84);
        /* 戗柱与柱身之间的销钉 */
        P(isStone ? 'dark' : 'woodDark', slabG(0.10, 0.14, 0.20, cx + sx * 0.30, 2.95, 0, S));
      }
    }
  }

  /* ═══ 2. 额枋（横枋）+ 端头出头 ═══════════════════════ */
  const loW = SPAN + 0.86, hiW = SPAN + 1.10;
  P(isStone ? 'stone' : 'wood', slabG(loW, 0.26, isStone ? 0.62 : 0.66, 0, LINTEL_LO + 0.13, 0, S), 1.00);
  P(isStone ? 'dark' : 'woodDark', slabG(hiW + 0.02, 0.07, isStone ? 0.80 : 0.84, 0, LINTEL_HI - 0.04, 0, S), 0.86);
  P(isStone ? 'stone' : 'wood', slabG(hiW, 0.38, isStone ? 0.76 : 0.80, 0, LINTEL_HI + 0.19, 0, S), 1.06);
  /* 枋端头：出头 + 端头石 */
  for (const sx of [-1, 1]) {
    P(isStone ? 'stone' : 'wood', slabG(0.20, 0.44, isStone ? 0.80 : 0.84, sx * (SPAN / 2 + 0.55), LINTEL_HI + 0.19, 0, S));
    P(isStone ? 'dark' : 'woodDark', slabG(0.16, 0.30, isStone ? 0.66 : 0.70, sx * (SPAN / 2 + 0.40), LINTEL_LO + 0.13, 0, S));
  }

  /* ═══ 3. 雀替（柱内侧的短托） ═════════════════════════ */
  for (let i = 0; i < 4; i++) {
    const cx = COL_X[i];
    const s = -Math.sign(cx);                 // 朝中间跨方向
    const tilt = 0.60;
    const g = new THREE.BoxGeometry(0.40, 0.13, 0.26);
    g.rotateZ(s * tilt);
    g.translate(cx + s * 0.20, 3.90, 0);
    P(isStone ? 'stone' : 'wood', g, 1.20);
    /* 托木下的小斗 */
    P(isStone ? 'dark' : 'woodDark', slabG(0.18, 0.12, 0.24, cx + s * 0.06, 3.80, 0, S));
  }

  /* ═══ 3. 额枋彩画：朱红地 + 描金箍头 + 藻头团花 ═══════
     "素"就素在没有颜色。两根枋之间画三段，
     中间那段的中心留给匾额（画不到匾额上）。 */
  {
    const dp = isStone ? 0.76 : 0.80;
    const BAYS = [[-4.5, -1.8], [-1.8, 1.8], [1.8, 4.5]];
    for (const sz of [-1, 1]) {
      const zf = sz * (dp / 2 + 0.010);
      for (const [a, b] of BAYS) {
        const w = b - a - 0.34, cx0 = (a + b) / 2;
        P('paint', slabG(w, 0.21, 0.022, cx0, LINTEL_HI + 0.19, zf, S));
        /* 上下描金线 + 两端箍头 */
        for (const dy2 of [0.118, -0.118]) {
          P('gold', slabG(w, 0.032, 0.030, cx0, LINTEL_HI + 0.19 + dy2, zf + sz * 0.008, S));
        }
        for (const dx2 of [-w / 2, w / 2]) {
          P('gold', slabG(0.085, 0.25, 0.030, cx0 + dx2, LINTEL_HI + 0.19, zf + sz * 0.008, S));
        }
        /* 藻头团花 */
        P('gold', cylR(0.115, 0.030, Math.PI / 2, cx0, LINTEL_HI + 0.19, zf + sz * 0.016, 12));
        P('paint', cylR(0.050, 0.040, Math.PI / 2, cx0, LINTEL_HI + 0.19, zf + sz * 0.024, 8));
      }
    }
  }

  /* ═══ 4. 顶部挑檐 / 小披檐（中间跨上方） ═══════════════ */
  if (isStone) {
    /* 石挑檐：檐板 + 四角起翘 + 两根斜撑 */
    P('stone', slabG(3.90, 0.14, 1.16, 0, DOUGONG_Y + 0.07, 0, S));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P('stone', boxR(0.26, 0.10, 0.26, sz * 0.26, 0, -sx * 0.26,
        sx * 1.82, DOUGONG_Y + 0.12, sz * 0.50));
    }
    for (const sx of [-1, 1]) {
      P('stone', boxR(0.12, 0.34, 0.12, 0, 0, sx * 0.5, sx * 1.30, DOUGONG_Y - 0.10, 0));
    }
    /* 石挑檐上也起一个小瓦顶（有正脊才不是一块石板） */
    tileRoof(P, 3.76, DOUGONG_Y + 0.34, DOUGONG_Y + 0.10, 0.56, 'tile', 'dark', S);
  } else {
    /* 木披檐：两坡望板 + 椽 + 脊 */
    const ang = Math.atan2(0.30, 0.62), run = 0.70;
    for (const sz of [-1, 1]) {
      P('wood', boxR(3.60, 0.09, run, sz * ang, 0, 0, 0, DOUGONG_Y + 0.12, sz * 0.30));
      P('woodDark', boxR(3.66, 0.05, run * .92, sz * ang, 0, 0, 0, DOUGONG_Y + 0.03, sz * 0.30));
      for (let k = 0; k < 9; k++) {
        const bx = -1.60 + k * 0.40;
        P('wood', cylR(0.035, run * .96, sz * (ang - Math.PI / 2), bx, DOUGONG_Y - 0.02, sz * 0.30, 6));
      }
    }
    P('wood', slabG(3.70, 0.10, 0.26, 0, DOUGONG_Y + 0.20, 0, S));
    /* 披檐上的瓦顶：瓦垄 + 正脊 + 垂脊 + 脊头吻兽 */
    tileRoof(P, 3.62, DOUGONG_Y + 0.30, DOUGONG_Y + 0.03, 0.60, 'tile', 'dark', S);
  }

  /* ═══ 5. 匾额（中间跨，吊在小额枋下） ═════════════════ */
  P(isStone ? 'dark' : 'woodDark', slabG(PW, PH, 0.10, 0, PLAQUE_Y, 0, S));
  const frameK = isStone ? 'gold' : 'wood';
  P(frameK, slabG(PW + 0.28, 0.11, 0.16, 0, PLAQUE_Y + 0.495, 0, S));
  P(frameK, slabG(PW + 0.28, 0.11, 0.16, 0, PLAQUE_Y - 0.495, 0, S));
  for (const sx of [-1, 1]) {
    P(frameK, slabG(0.11, PH + 0.16, 0.16, sx * (PW / 2 + 0.055), PLAQUE_Y, 0, S));
    P(frameK, slabG(0.16, 0.16, 0.20, sx * (PW / 2 + 0.055), PLAQUE_Y + 0.495, 0, S));
    P(frameK, slabG(0.16, 0.16, 0.20, sx * (PW / 2 + 0.055), PLAQUE_Y - 0.495, 0, S));
    /* 吊钩（从匾框挂到小额枋） */
    P(isStone ? 'gold' : 'woodDark', slabG(0.05, 0.16, 0.05, sx * 0.82, PLAQUE_Y + 0.63, 0, S));
  }

  /* ═══ 5.5 楹联（中间跨两根内柱）═════════════════════════
     木边框 + 深色底板 + 浅色字。字用简单几何条拼（不另做贴图，
     省 draw call），远看是竖排的一列字，近看有笔画。 */
  {
    const CW = 0.34, CH = 1.62, CY = 2.30;
    for (const sx of [-1, 1]) {
      const cx = sx * 1.80;
      for (const sz of [-1, 1]) {
        const zb = sz * 0.33;
        /* 深色底板 */
        P('woodDark', slabG(CW, CH, 0.045, cx, CY, zb, S), 0.80);
        /* 木边框：上下横枋 + 左右竖枋 */
        P('wood', slabG(CW + 0.13, 0.075, 0.085, cx, CY + CH / 2 + 0.02, zb, S), 1.04);
        P('wood', slabG(CW + 0.13, 0.075, 0.085, cx, CY - CH / 2 - 0.02, zb, S), 1.04);
        P('wood', slabG(0.075, CH + 0.11, 0.085, cx - CW / 2 - 0.02, CY, zb, S), 1.04);
        P('wood', slabG(0.075, CH + 0.11, 0.085, cx + CW / 2 + 0.02, CY, zb, S), 1.04);
        /* 字：五字，竖排，每字三四笔 */
        const zt = zb + sz * 0.030;
        for (let k = 0; k < 5; k++) {
          const y = CY + 0.52 - k * 0.26;
          P('gold', slabG(0.17, 0.030, 0.014, cx, y + 0.05, zt, S), 1.10);
          P('gold', slabG(0.030, 0.15, 0.014, cx - 0.055, y - 0.02, zt, S), 1.10);
          P('gold', slabG(0.030, 0.15, 0.014, cx + 0.055, y - 0.02, zt, S), 1.10);
          P('gold', slabG(0.11, 0.026, 0.014, cx, y - 0.09, zt, S), 1.10);
        }
      }
    }
  }

  /* ═══ 6. 合批出 mesh ═══════════════════════════════════
     每个桶合一个 mesh；顶点色（明暗）合完再算，
     这样"朝上的面亮、朝下的面暗"是按合并后的真实法线算的。 */
  const meshes = [];
  const SHADE = {
    stone: { y0: 0, y1: 6.4, s0: .82, s1: 1.06, up: .24, jit: .06 },
    dark: { y0: 0, y1: 6.4, s0: .72, s1: .96, up: .20, jit: .05 },
    wood: { y0: 0, y1: 6.4, s0: .76, s1: 1.12, up: .26, jit: .06, grain: .085 },
    woodDark: { y0: 0, y1: 6.4, s0: .70, s1: 1.02, up: .24, jit: .05, grain: .07 },
    gold: { y0: 0, y1: 6.4, s0: .86, s1: 1.12, up: .30, jit: .04 },
    paint: { y0: 0, y1: 6.4, s0: .86, s1: 1.08, up: .20, jit: .04 },
    tile: { y0: 0, y1: 6.4, s0: .84, s1: 1.08, up: .28, jit: .05 },
  };
  const MATS = {
    stone: matClone(MAT.stone, { color: 0xb4b0a4 }),
    dark: matClone(MAT.stoneDark, { color: 0x848177 }),
    wood: matClone(MAT.wood, { color: [1.45, 1.24, 0.94] }),      // 木料别再压黑
    woodDark: matClone(MAT.woodDark, { color: [1.05, 0.84, 0.62] }),
    gold: matClone(MAT.gold, { metalness: .84, roughness: .30 }),
    paint: matClone(MAT.woodRed, { color: [2.55, 0.82, 0.72], roughness: .62, metalness: .05 }),
    tile: matClone(MAT.tile, { color: 0xa8aeb6 }),
  };
  const push = (geos, mat, name, opt) => {
    if (!geos.length) return;
    /* 逐件上色（每件自己的色调档 + 木纹），再合批 —— 合完就分不出件了 */
    for (const g of geos) shade(g, Object.assign({}, opt, { tone: TONE.get(g) ?? 1 }));
    const m = meshOf(geos, mat);
    if (!m) return;
    m.name = name;
    meshes.push(m);
  };
  push(G.stone, MATS.stone, 'pf-stone', SHADE.stone);
  push(G.dark, MATS.dark, 'pf-stone-dark', SHADE.dark);
  push(G.wood, MATS.wood, 'pf-wood', SHADE.wood);
  push(G.woodDark, MATS.woodDark, 'pf-wood-dark', SHADE.woodDark);
  push(G.gold, MATS.gold, 'pf-gold', SHADE.gold);
  push(G.paint, MATS.paint, 'pf-paint', SHADE.paint);
  push(G.tile, MATS.tile, 'pf-tile', SHADE.tile);
  const plaque = meshOf([plaqueFaceGeo()], plaqueMat(text));
  plaque.name = 'pf-plaque';
  meshes.push(plaque);
  return meshes;
}

/* ── 主入口 ───────────────────────────────────────────────── */
function seedOf(layout) {
  const s = layout && layout.seed;
  if (typeof s === 'number' && isFinite(s)) return s | 0;
  const n = parseInt(String(s), 10);
  return isNaN(n) ? 0 : (n | 0);
}

export function build(layout) {
  const group = new THREE.Group();
  group.name = 'model-paifang';
  const list = (layout && Array.isArray(layout.paifangs)) ? layout.paifangs : [];
  if (!list.length) return group;

  initMaterials();
  const r = makeRng((seedOf(layout) ^ 0x9a3f) >>> 0);

  /* 匾额题字：村子名 / 江南 / 古村 */
  const cand = ['江南', '古村', '水乡', '旧里'];
  const village = (layout.landmark && layout.landmark.name) || '古村';
  cand.push(village);

  let drawCalls = 0;
  const aoGeos = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const kind = p.kind === 'wood' ? 'wood' : 'stone';
    const sub = new THREE.Group();
    sub.name = 'paifang-' + kind + '-' + i;
    sub.position.set(p.x, 0, p.z);
    sub.rotation.y = p.rot || 0;          // 正面朝 rot，柱列垂直于 rot

    const text = r.pick(cand);
    for (const m of buildOne(kind, text)) { sub.add(m); drawCalls++; }

    /* ── 接地阴影 ──
       柱子脚下一圈实一点的影（柱础是圆的，影也该是圆的），
       再加一片覆盖整座牌坊的淡影，让它不是"四根柱子浮在草上"。
       世界坐标：局部 x 方向经 rot 旋转后 = (cos rot, 0, -sin rot) */
    const cr = Math.cos(p.rot || 0), sr = Math.sin(p.rot || 0);
    /* 柱脚各一圈实一点的影 + 整座一片淡影（core/ao.js 的 aoBatch，
       全部合成一个 mesh，只多 1 个 draw call）。
       aoBatch 把贴片钉在 y=0.02，主路面在 y=0.03 → 整体抬到 0.05，
       否则中间两根柱子的影子被路面盖住，等于没有。 */
    const pts = [];
    for (const cx of COL_X) pts.push({ x: p.x + cx * cr, z: p.z - cx * sr, r: 1.05, s: .52 });
    pts.push({ x: p.x, z: p.z, r: 4.70, s: .20 });
    for (const g of aoBatch(pts, aoMaterial())) { g.translate(0, 0.03, 0); aoGeos.push(g); }
    group.add(sub);
  }

  /* 所有牌坊的影合成一个 mesh（只多 1 个 draw call） */
  if (aoGeos.length) {
    const aoMesh = new THREE.Mesh(mergeGeometries(aoGeos, false), aoMaterial());
    aoMesh.name = 'paifang-ao';
    aoMesh.renderOrder = 2;
    aoMesh.castShadow = false;
    aoMesh.receiveShadow = false;
    aoMesh.matrixAutoUpdate = false;
    group.add(aoMesh);
    drawCalls++;
  }

  group.userData = { paifang: list.length, drawCalls };
  return group;
}
