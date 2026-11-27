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
  const G = { stone: [], dark: [], wood: [], woodDark: [], gold: [] };
  const P = (k, g) => G[k].push(g);
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
      P('stone', slabG(0.96, 0.22, 0.96, cx, 0.11, 0, S));
      P('stone', slabG(0.74, 0.18, 0.74, cx, 0.31, 0, S));
      P('dark', slabG(0.78, 0.06, 0.78, cx, 0.40, 0, S));   // 束腰雕花带
      P('stone', slabG(0.88, 0.16, 0.88, cx, 0.48, 0, S));
      /* 柱身（收分） */
      P('stone', shaftG(0.30, 0.25, colTop - baseTop, baseTop, cx));
      /* 柱身分节刻线 */
      for (const y of [2.20, 3.45]) {
        const t = (y - baseTop) / (colTop - baseTop);
        const hw = 0.30 + (0.25 - 0.30) * t + 0.02;
        P('dark', shaftG(hw, hw, 0.06, y - 0.03, cx));
      }
    } else {
      /* 木牌坊：方础石 + 覆盆 */
      P('stone', slabG(0.80, 0.30, 0.80, cx, 0.15, 0, S_STONE));
      P('stone', cylG(0.30, 0.36, 0.12, cx, 0.36, 0, 14));
      /* 木柱身（收分） */
      P('wood', roundShaftG(0.28, 0.235, colTop - baseTop, baseTop, cx));
      /* 柱箍（深色，与柱身有色差） */
      for (const y of [1.55, 2.85, 4.05]) {
        const t = (y - baseTop) / (colTop - baseTop);
        const rr = 0.28 + (0.235 - 0.28) * t + 0.025;
        P('woodDark', cylG(rr, rr, 0.11, cx, y, 0, 14));
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
      P('wood', cylG(0.28, 0.34, 0.30 * s, cx, colTop + 0.15 * s, 0, 14));
      P('woodDark', cylG(0.32, 0.32, 0.08 * s, cx, colTop + 0.34 * s, 0, 14));
      P('wood', slabG(0.56, 0.24 * s, 0.56, cx, colTop + 0.50 * s, 0, S));
      P('wood', slabG(1.02, 0.13 * s, 0.28, cx, colTop + 0.68 * s, 0, S));
      P('wood', slabG(0.88, 0.10 * s, 0.88, cx, colTop + 0.80 * s, 0, S));
      P('stone', slabG(0.46, 0.18 * s, 0.46, cx, colTop + 0.92 * s, 0, S_STONE));
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
  }

  /* ═══ 2. 额枋（横枋）+ 端头出头 ═══════════════════════ */
  const loW = SPAN + 0.86, hiW = SPAN + 1.10;
  P(isStone ? 'stone' : 'wood', slabG(loW, 0.26, isStone ? 0.62 : 0.66, 0, LINTEL_LO + 0.13, 0, S));
  P(isStone ? 'dark' : 'woodDark', slabG(hiW + 0.02, 0.07, isStone ? 0.80 : 0.84, 0, LINTEL_HI - 0.04, 0, S));
  P(isStone ? 'stone' : 'wood', slabG(hiW, 0.38, isStone ? 0.76 : 0.80, 0, LINTEL_HI + 0.19, 0, S));
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
    P(isStone ? 'stone' : 'wood', g);
    /* 托木下的小斗 */
    P(isStone ? 'dark' : 'woodDark', slabG(0.18, 0.12, 0.24, cx + s * 0.06, 3.80, 0, S));
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

  /* ═══ 6. 合批出 mesh ═══════════════════════════════════ */
  const meshes = [];
  const push = (geos, mat, name) => {
    if (!geos.length) return;
    const m = meshOf(geos, mat);
    m.name = name;
    meshes.push(m);
  };
  push(G.stone, MAT.stone, 'pf-stone');
  push(G.dark, MAT.stoneDark, 'pf-stone-dark');
  push(G.wood, MAT.wood, 'pf-wood');
  push(G.woodDark, MAT.woodDark, 'pf-wood-dark');
  push(G.gold, MAT.gold, 'pf-gold');
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
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const kind = p.kind === 'wood' ? 'wood' : 'stone';
    const sub = new THREE.Group();
    sub.name = 'paifang-' + kind + '-' + i;
    sub.position.set(p.x, 0, p.z);
    sub.rotation.y = p.rot || 0;          // 正面朝 rot，柱列垂直于 rot

    const text = r.pick(cand);
    for (const m of buildOne(kind, text)) { sub.add(m); drawCalls++; }
    group.add(sub);
  }

  group.userData = { paifang: list.length, drawCalls };
  return group;
}
