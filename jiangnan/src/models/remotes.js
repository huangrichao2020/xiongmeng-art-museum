/* ── 远景：外扩裙边 + 村外林带 + 田野色块 + 三层远山剪影 ──────────
   为什么需要它：
   村子只铺了 256m×256m，站在村中心往外看，先看到地形边缘（一条硬线），
   再就是空白天空 —— 这就是「村子浮在白纸上」的豆包感来源。
   江南实景该有的层次是：脚下的地 → 村外的田 → 林带 → 远山 → 天。
   所以这里做四件事：
   ① 裙边 apron：地形边缘之外铺一圈缓缓下降的坡地，颜色渐变到雾色，
      把地形边界整个吃掉，画面里看不到「世界到此为止」。
   ② 田野 fields：村外一圈不规则色块（黄褐/青绿/深绿），打破「一块绿草坪」。
   ③ 林带 trees：村外一圈低模树丛剪影，撑起中景层次。
   ④ 远山 ridge：三层环形山影，底色=当前雾色、顶色=雾色压暗，
      天然跟着天色走（日里青灰、黄昏金褐、夜里墨蓝），永远是剪影不是实体。

   材质刻意用 unlit / 低光：远景一旦接受太阳直射就会「实」，
   实了就没有纵深。剪影 + 大气透视才是远处的正确写法。            */

import * as THREE from 'three';

/* 裙边：外扩范围与分层 */
const APRON = {
  inner: 120,      /* 往地形里面塞 8m（地形半宽 128），确保没有缝 */
  out: 900,        // 最远到哪
  drop: 24         // 最远处降到多低（低于地平线，让天从远处压过来）
};

/* 村外景观带：半径范围 */
const BELT = { r0: 136, r1: 268 };

/* 三层山：半径 / 基准高 / 主峰高 / 顶色压暗系数 */
const RIDGES = [
  { r: 300, base: 26, peak: 26, k: 0.62, seed: 0.7 },
  { r: 470, base: 44, peak: 42, k: 0.77, seed: 2.9 },
  { r: 700, base: 66, peak: 64, k: 0.88, seed: 5.1 }
];

/* 裙边内侧的草色近似（要贴近地形边缘实际色，否则会看出接缝）
   注意：new THREE.Color(r,g,b) 的三个数是「线性」值，不是 sRGB。
   写 0.30 会变成 sRGB 0.58（亮得多），所以这里按线性给值。 */
const GRASS = new THREE.Color(0.115, 0.155, 0.070);

/* 田野色块用的几种颜色（黄昏/夜里会被雾色压掉一部分） */
const FIELD_COLORS = [
  new THREE.Color(0.185, 0.150, 0.062),  // 收割后的黄褐
  new THREE.Color(0.072, 0.140, 0.052),  // 青绿
  new THREE.Color(0.040, 0.086, 0.030),  // 深绿
  new THREE.Color(0.115, 0.130, 0.058)   // 灰绿
];
const TREE_COL = new THREE.Color(0.052, 0.086, 0.046);
/* 远黛色：远山往这个方向压（线性值，同上） */
const RIDGE_COOL = new THREE.Color(0.072, 0.112, 0.158);

/* ── 小工具：确定性随机 ──────────────────────────────────────── */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 裙边高度：贴着地形边缘 → 缓缓下降 */
function apronY(r) {
  const t = Math.min(1, Math.max(0, (r - APRON.inner) / (APRON.out - APRON.inner)));
  const e = t * t * (3 - 2 * t);
  return -0.25 - APRON.drop * e * e;
}

/* 雾化权重：r 越大越接近雾色 */
function haze(r) {
  const t = Math.min(1, Math.max(0, (r - BELT.r0) / (340 - BELT.r0)));
  /* 远景是 unlit 的，雾化权重直接决定它有多淡。
     别超过 0.30，再高就成一片惨白纸片（比没有更假）。 */
  return 0.06 + 0.24 * t * t;
}

/* ── 山脊线：多频正弦 + 几座主峰 ─────────────────────────────── */
function ridgeHeight(a, cfg) {
  const o = cfg.seed;
  let s = 0.5
    + 0.30 * Math.sin(a * 3.1 + o)
    + 0.19 * Math.sin(a * 5.7 + o * 1.7)
    + 0.10 * Math.sin(a * 11.3 + o * 2.3)
    + 0.06 * Math.sin(a * 19.7 + o * 3.1);
  s = Math.max(0, Math.min(1.15, s));
  let h = cfg.base * (0.30 + 0.70 * s);
  /* 主峰：让山有明确的"几座峰"而不是均匀搓衣板 */
  for (let k = 0; k < 4; k++) {
    const th = o * 1.9 + k * 1.73;
    const amp = cfg.peak * (0.42 + 0.20 * ((k * 7 + cfg.seed) % 3));
    const w = 0.20 + 0.13 * ((k * 3) % 3);
    let d = a - th;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    h += amp * Math.exp(-(d * d) / (2 * w * w));
  }
  return h;
}

/* ── 合并：自己写一个够用的（支持 position/normal/color/index） ── */
function mergePieces(list) {
  let vcount = 0, icount = 0, hasColor = false;
  for (const g of list) {
    vcount += g.attributes.position.count;
    icount += g.index ? g.index.count : g.attributes.position.count;
    if (g.attributes.color) hasColor = true;
  }
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const col = hasColor ? new Float32Array(vcount * 3) : null;
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const o3 = (vo + i) * 3;
      pos[o3] = p.getX(i); pos[o3 + 1] = p.getY(i); pos[o3 + 2] = p.getZ(i);
      if (n) { nor[o3] = n.getX(i); nor[o3 + 1] = n.getY(i); nor[o3 + 2] = n.getZ(i); }
      if (col && c) { col[o3] = c.getX(i); col[o3 + 1] = c.getY(i); col[o3 + 2] = c.getZ(i); }
    }
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo; io += g.index.count; }
    else { for (let i = 0; i < p.count; i++) idx[io + i] = vo + i; io += p.count; }
    vo += p.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

/* 给几何刷上「基色 + 雾化权重」，setSky 时按雾色重算 */
function paint(geo, base, t) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  const tt = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    c[i * 3] = base.r; c[i * 3 + 1] = base.g; c[i * 3 + 2] = base.b;
    tt[i] = typeof t === 'function' ? t(p.getX(i), p.getZ(i)) : t;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.userData.base = base;
  geo.userData.t = tt;
  return geo;
}


/* 按位置把法线平均掉（不合并顶点，面数不变）。
   IcosahedronGeometry 是非索引的，同一位置有 3 个独立顶点，
   computeVertexNormals() 只能算出每个面的法线 —— 远看就是一颗颗棱面石头。 */
function smoothNormals(geo) {
  const p = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const map = new Map();
  const key = (x, y, z) => `${x.toFixed(4)}|${y.toFixed(4)}|${z.toFixed(4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    let a = map.get(k);
    if (!a) { a = []; map.set(k, a); }
    a.push(i);
  }
  for (const arr of map.values()) {
    if (arr.length < 2) continue;
    let nx = 0, ny = 0, nz = 0;
    for (const i of arr) { nx += n.getX(i); ny += n.getY(i); nz += n.getZ(i); }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const i of arr) n.setXYZ(i, nx, ny, nz);
  }
  n.needsUpdate = true;
  return geo;
}

/* ── 裙边网格：四个环带 + 四个角，中央留出地形洞 ─────────────── */
function buildApron() {
  const inner = APRON.inner, outer = APRON.out;
  const pieces = [];
  const bandW = 6;
  const mkBand = (x0, x1, z0, z1, sx, sz) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    pieces.push(g);
  };
  mkBand(-outer, outer, -outer, -inner, bandW * 3, bandW);
  mkBand(-outer, outer, inner, outer, bandW * 3, bandW);
  mkBand(-outer, -inner, -inner, inner, bandW, bandW * 2);
  mkBand(inner, outer, -inner, inner, bandW, bandW * 2);
  /* 四个角：沿对角切掉一块，做成斜角楔形 */
  const mkCorner = (sx, sz) => {
    const g = new THREE.PlaneGeometry(outer - inner, outer - inner, bandW, bandW);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const far = Math.max(Math.abs(x), Math.abs(z));
      if (far > (outer - inner) * 0.5) {
        const t = (far - (outer - inner) * 0.5) / ((outer - inner) * 0.5);
        p.setX(i, x - Math.sign(x) * t * (outer - inner) * 0.34);
        p.setZ(i, z - Math.sign(z) * t * (outer - inner) * 0.34);
      }
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    g.translate(sx * (inner + (outer - inner) * 0.5), 0, sz * (inner + (outer - inner) * 0.5));
    pieces.push(g);
  };
  mkCorner(-1, -1); mkCorner(1, -1); mkCorner(-1, 1); mkCorner(1, 1);

  const geo = mergePieces(pieces);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.max(Math.abs(x), Math.abs(z));
    pos.setY(i, apronY(r));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  /* 裙边：内侧草色 → 外侧雾色 */
  paint(geo, GRASS, (x, z) => {
    const r = Math.max(Math.abs(x), Math.abs(z));
    const t = Math.min(1, Math.max(0, (r - APRON.inner) / (APRON.out - APRON.inner)));
    const e = t * t * (3 - 2 * t);
    return Math.min(0.97, 0.10 + 0.87 * e);
  });
  return geo;
}

/* ── 村外田野：环带里的不规则色块 ───────────────────────────── */
function buildFields(rnd) {
  const pieces = [];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = BELT.r0 + 12 + rnd() * (BELT.r1 - BELT.r0 - 30);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const rad = 11 + rnd() * 17;
    const sides = 6 + Math.floor(rnd() * 4);
    const rot = rnd() * Math.PI * 2;
    const shape = new THREE.Shape();
    for (let k = 0; k < sides; k++) {
      const ang = rot + (k / sides) * Math.PI * 2;
      const rr = rad * (0.62 + rnd() * 0.55);
      const x = cx + Math.cos(ang) * rr, z = cz + Math.sin(ang) * rr;
      if (k === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
    }
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);          /* Shape 在 XY，转到 XZ */
    g.translate(0, apronY(r) + 0.12, 0);
    pieces.push(g);
  }
  const geo = mergePieces(pieces);
  geo.computeVertexNormals();
  return geo;
}

/* ── 村外林带：低模树丛剪影 ─────────────────────────────────── */
function buildTreeline(rnd) {
  const pieces = [];
  const clumps = 9;
  for (let ci = 0; ci < clumps; ci++) {
    const ca = (ci / clumps) * Math.PI * 2 + rnd() * 0.5;
    const cr = BELT.r0 + 18 + rnd() * (BELT.r1 - BELT.r0 - 50);
    const cxx = Math.cos(ca) * cr, czz = Math.sin(ca) * cr;
    const n = 10 + Math.floor(rnd() * 10);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * 16;
      const x = cxx + Math.cos(a) * rr, z = czz + Math.sin(a) * rr;
      const r = Math.hypot(x, z);
      if (r < BELT.r0 - 6 || r > BELT.r1 + 14) continue;
      const h = 3.6 + rnd() * 4.2;
      const rad = 0.85 + rnd() * 1.05;
      /* 干 */
      const trunk = new THREE.CylinderGeometry(rad * 0.10, rad * 0.17, h * 0.55, 5);
      trunk.translate(x, apronY(r) + h * 0.275, z);
      pieces.push(trunk);
      /* 冠：远处看树，锥形（杉/松）比圆球更像树；
         圆球冠只在近处才成立，远处就是一团棉花糖/石头。 */
      let crown;
      if (rnd() < .55) {
        crown = new THREE.ConeGeometry(rad, h * .70, 6, 1);
        crown.translate(x, apronY(r) + h * .52, z);
      } else {
        crown = new THREE.IcosahedronGeometry(rad * 1.05, 0);
        crown.scale(1, 1.35, 1);
        crown.translate(x, apronY(r) + h * .70, z);
      }
      pieces.push(crown);
    }
  }
  const geo = mergePieces(pieces);
  geo.computeVertexNormals();
  smoothNormals(geo);
  return geo;
}

/* ── 远山幕布：环状竖直带 ─────────────────────────────────────── */
function buildRidge(cfg) {
  const N = 200;
  const pos = [], col = [], idx = [];
  const bot = -40;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const cx = Math.cos(a) * cfg.r, cz = Math.sin(a) * cfg.r;
    const h = ridgeHeight(a, cfg);
    pos.push(cx, bot, cz);
    pos.push(cx, h, cz);
    col.push(1, 1, 1);   /* 底 */
    col.push(1, 1, 1);   /* 顶 */
  }
  for (let i = 0; i < N; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.userData.base = new THREE.Color(1, 1, 1);
  geo.userData.t = null;          /* 山单独处理：底=雾色，顶=雾色×k */
  geo.userData.ridgeK = cfg.k;
  return geo;
}


/* ── 月亮与星空（只在夜里出现） ─────────────────────────────── */
function moonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,252,240,1)');
  rg.addColorStop(.52, 'rgba(246,242,226,.96)');
  rg.addColorStop(.62, 'rgba(220,224,214,.35)');
  rg.addColorStop(1, 'rgba(200,210,215,0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildMoon() {
  const g = new THREE.Group();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTexture(), transparent: true, depthWrite: false,
    depthTest: false, fog: false, opacity: .55
  }));
  halo.scale.setScalar(190);
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTexture(), transparent: true, depthWrite: false,
    depthTest: false, fog: false, opacity: 1
  }));
  disc.scale.setScalar(62);
  g.add(halo); g.add(disc);
  g.position.set(-300, 250, -520);
  g.renderOrder = -10;
  return g;
}

function buildStars(rnd) {
  const N = 260;
  const pos = new Float32Array(N * 3);
  const sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    /* 只在天空上半球 */
    const a = rnd() * Math.PI * 2;
    const y = .12 + rnd() * .88;
    const r = Math.sqrt(1 - y * y);
    const R = 1500;
    pos[i * 3] = Math.cos(a) * r * R;
    pos[i * 3 + 1] = y * R;
    pos[i * 3 + 2] = Math.sin(a) * r * R;
    sz[i] = 2 + rnd() * 5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, fog: false,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `
      attribute float aSize;
      varying float vS;
      void main(){
        vS = aSize;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying float vS;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.05, r) * uOpacity;
        gl_FragColor = vec4(0.86, 0.90, 1.0, a);
      }`
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -11;
  return pts;
}

/* ── 入口 ─────────────────────────────────────────────────────── */
export function build(layout) {
  const group = new THREE.Group();
  group.name = 'model-remotes';
  const rnd = mulberry((layout.seed ^ 0x5eed1e) >>> 0);

  /* 裙边 */
  const apronGeo = buildApron();
  const apronMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.name = 'remotes-apron';
  apron.renderOrder = -2;
  group.add(apron);

  /* 村外田野 */
  const fieldGeo = buildFields(rnd);
  paint(fieldGeo, FIELD_COLORS[0], (x, z) => {
    const r = Math.hypot(x, z);
    const t = haze(r);
    /* 每个色块按自己的色相，靠顶点位置选色：这里用噪声式的角度分段近似 */
    return t;
  });
  /* 田野每块一个颜色 → 用位置做分段取色 */
  {
    const p = fieldGeo.attributes.position, c = fieldGeo.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const k = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 8));
      const col = FIELD_COLORS[k % FIELD_COLORS.length];
      c.setXYZ(i, col.r, col.g, col.b);
    }
    c.needsUpdate = true;
  }
  /* 远景不吃场景雾、不接受太阳直射：
     雾色在 three 里是线性空间的值（0xc6d6e2 → 线性约 0.6），
     混一点点就把远景冲成惨白。改成 unlit + fog:false，
     「雾化」完全由顶点色自己算，想多淡就多淡。 */
  const fieldMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: false
  });
  const fields = new THREE.Mesh(fieldGeo, fieldMat);
  fields.name = 'remotes-fields';
  fields.renderOrder = -1;
  group.add(fields);

  /* 村外林带 */
  const treeGeo = buildTreeline(rnd);
  paint(treeGeo, TREE_COL, (x, z) => haze(Math.hypot(x, z)));
  const treeMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: false
  });
  const trees = new THREE.Mesh(treeGeo, treeMat);
  trees.name = 'remotes-treeline';
  group.add(trees);

  /* 远山 */
  const ridgeMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: true
  });
  const ridges = [];
  for (const cfg of RIDGES) {
    const m = new THREE.Mesh(buildRidge(cfg), ridgeMat);
    m.name = 'remotes-ridge-' + cfg.r;
    m.renderOrder = -3;
    group.add(m);
    ridges.push({ mesh: m, cfg });
  }

  /* 月亮与星空（夜里才亮） */
  const moon = buildMoon();
  const stars = buildStars(rnd);
  group.add(stars); group.add(moon);

  /* 天色联动：所有颜色都从「当前雾色」推出来 → 换时段自动协调 */
  const fogC = new THREE.Color(0xc6d6e2);
  const layers = [apronGeo, fieldGeo, treeGeo];
  let nightAmt = 0;

  function setSky(c, night) {
    if (c) fogC.copy(c);
    if (typeof night === 'number') nightAmt = night;
    /* 裙边 / 田野 / 林带：基色 → 雾色，按各自的雾化权重混 */
    for (const geo of layers) {
      const p = geo.attributes.position, col = geo.attributes.color;
      const base = geo.userData.base, ts = geo.userData.t;
      for (let i = 0; i < col.count; i++) {
        const t = ts ? ts[i] : 0;
        /* 田野的基色是逐点存的，这里 base 是兜底，实际用 color 里存的基色不行，
           所以田野单独在下面处理；这里只处理 base 单色的两层 */
        col.setXYZ(i,
          base.r + (fogC.r - base.r) * t,
          base.g + (fogC.g - base.g) * t,
          base.b + (fogC.b - base.b) * t);
      }
      col.needsUpdate = true;
    }
    /* 田野：基色逐点存在 auxBase 里 */
    if (fieldGeo.userData.auxBase) {
      const col = fieldGeo.attributes.color, ab = fieldGeo.userData.auxBase, ts = fieldGeo.userData.t;
      for (let i = 0; i < col.count; i++) {
        const t = ts[i];
        col.setXYZ(i,
          ab[i * 3] + (fogC.r - ab[i * 3]) * t,
          ab[i * 3 + 1] + (fogC.g - ab[i * 3 + 1]) * t,
          ab[i * 3 + 2] + (fogC.b - ab[i * 3 + 2]) * t);
      }
      col.needsUpdate = true;
    }
    /* 月亮与星空：只有夜里才亮 */
    const nv = Math.max(0, Math.min(1, nightAmt));
    moon.visible = nv > .02;
    stars.material.uniforms.uOpacity.value = nv * .85;
    stars.visible = nv > .02;

    /* 远山：底=雾色，顶=雾色压暗 */
    for (const { mesh, cfg } of ridges) {
      const g = mesh.geometry;
      const c2 = g.attributes.color;
      for (let i = 0; i < c2.count; i++) {
        const top = (i % 2) === 1;
        const k = top ? cfg.k : 1.0;
        /* 远山偏冷：直接用雾色会染成粉褐色（晨雾色偏红），
           掺一点冷青灰才像水墨里的远黛 */
        c2.setXYZ(i,
          (fogC.r * .58 + RIDGE_COOL.r * .42) * k,
          (fogC.g * .58 + RIDGE_COOL.g * .42) * k,
          (fogC.b * .58 + RIDGE_COOL.b * .42) * k);
      }
      c2.needsUpdate = true;
    }
  }
  /* 田野的逐点基色另存一份，setSky 时按雾色混 */
  {
    const c = fieldGeo.attributes.color;
    const ab = new Float32Array(c.count * 3);
    for (let i = 0; i < c.count; i++) { ab[i * 3] = c.getX(i); ab[i * 3 + 1] = c.getY(i); ab[i * 3 + 2] = c.getZ(i); }
    fieldGeo.userData.auxBase = ab;
  }
  group.userData.setSky = setSky;
  setSky(fogC);
  return group;
}
