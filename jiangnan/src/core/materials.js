/* 江南古村 · 共享调色板 + 程序化贴图
   所有模型模块都用这里的材质，保证整张图是一套颜色/一套质感。 */
import * as THREE from 'three';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function btex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}
/* 噪点：给贴图加不均匀的手工感 */
function speckle(ctx, w, h, n, color, a = .06, size = 1.6) {
  ctx.save();
  ctx.globalAlpha = a; ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = size * (.4 + Math.random());
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (.6 + Math.random() * .8), Math.random() * 3, 0, 7); ctx.fill();
  }
  ctx.restore();
}

/* ── 黛瓦：一垄一垄的小青瓦 ── */
function tileCanvas() {
  const W = 256, H = 256, [c, g] = cv(W, H);
  /* 底色别太黑：贴图本身已经带明暗渐变，底色再压暗，
     远看屋顶就是一块纯黑，瓦垄完全读不出来。 */
  g.fillStyle = '#5f5d59'; g.fillRect(0, 0, W, H);
  const rows = 8, rh = H / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const grd = g.createLinearGradient(0, y, 0, y + rh);
    grd.addColorStop(0, '#474540'); grd.addColorStop(.35, '#767268');
    grd.addColorStop(.72, '#5d5b55'); grd.addColorStop(1, '#3a3835');
    g.fillStyle = grd; g.fillRect(0, y, W, rh);
    /* 瓦垄：竖向的半圆凸起 */
    const cols = 10, cw = W / cols;
    for (let k = 0; k < cols; k++) {
      const x = k * cw;
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, 'rgba(20,19,17,.46)');
      gr.addColorStop(.28, 'rgba(196,188,172,.30)');
      gr.addColorStop(.6, 'rgba(62,60,55,.10)');
      gr.addColorStop(1, 'rgba(20,19,17,.44)');
      g.fillStyle = gr; g.fillRect(x, y, cw, rh);
    }
    g.strokeStyle = 'rgba(26,25,22,.46)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, y + rh - .7); g.lineTo(W, y + rh - .7); g.stroke();
  }
  speckle(g, W, H, 900, '#0b0e12', .10, 1.4);
  return c;
}
/* ── 白墙：粉墙 + 水渍斑驳 ── */
function plasterCanvas() {
  const W = 256, H = 256, [c, g] = cv(W, H);
  g.fillStyle = '#e9e3d6'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 1400, '#b9b0a0', .10, 2.6);
  speckle(g, W, H, 260, '#6f6a5e', .05, 3.2);
  /* 雨痕 */
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W, w = 3 + Math.random() * 12, h = 40 + Math.random() * 160;
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(96,90,78,.16)'); grd.addColorStop(1, 'rgba(96,90,78,0)');
    g.fillStyle = grd; g.fillRect(x, 0, w, h);
  }
  return c;
}
/* ── 石板路：不规则石块 ── */
function stoneCanvas() {
  const W = 256, H = 256, [c, g] = cv(W, H);
  g.fillStyle = '#6e6d66'; g.fillRect(0, 0, W, H);
  const cell = 32;
  for (let y = 0; y < H; y += cell) {
    const off = ((y / cell) % 2) * cell * .5;
    for (let x = -cell; x < W; x += cell) {
      const px = x + off + 1.5, py = y + 1.5, pw = cell - 3, ph = cell - 3;
      const v = 118 + Math.random() * 46;
      g.fillStyle = `rgb(${v | 0},${(v * .99) | 0},${(v * .93) | 0})`;
      g.beginPath();
      g.roundRect(px, py, pw, ph, 3.5 + Math.random() * 3);
      g.fill();
      g.strokeStyle = 'rgba(40,40,36,.5)'; g.lineWidth = 1.6; g.stroke();
    }
  }
  speckle(g, W, H, 700, '#4a4a44', .12, 1.8);
  return c;
}
/* ── 木纹 ── */
function woodCanvas() {
  const W = 128, H = 256, [c, g] = cv(W, H);
  g.fillStyle = '#6b4b34'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W, w = 1 + Math.random() * 4;
    g.strokeStyle = `rgba(${40 + Math.random() * 40 | 0},${26 + Math.random() * 24 | 0},${16 + Math.random() * 16 | 0},${.14 + Math.random() * .3})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= H; y += 16) g.lineTo(x + Math.sin(y * .05 + i) * 3.2, y);
    g.stroke();
  }
  return c;
}
/* ── 草 / 泥 / 田泥 ── */
function groundCanvas(base, alt, n) {
  const W = 256, H = 256, [c, g] = cv(W, H);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  speckle(g, W, H, n, alt, .16, 3.2);
  speckle(g, W, H, n * .4, '#000000', .07, 2.4);
  return c;
}
/* ── 水面波纹法线 ── */
function waterNormalCanvas() {
  const W = 256, H = 256, [c, g] = cv(W, H);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const a = Math.sin(x * .13 + Math.sin(y * .07) * 2.2) * .5 + .5;
    const b = Math.sin(y * .17 + Math.cos(x * .05) * 1.8) * .5 + .5;
    img.data[i] = 120 + a * 20; img.data[i + 1] = 128 + (b - .5) * 26; img.data[i + 2] = 240; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
/* ── 窗纸 / 灯笼纸 ── */
function paperCanvas() {
  const W = 128, H = 128, [c, g] = cv(W, H);
  g.fillStyle = '#f6dfa8'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(150,90,40,.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * W / 4, 0); g.lineTo(i * W / 4, H); g.stroke();
    g.beginPath(); g.moveTo(0, i * H / 4); g.lineTo(W, i * H / 4); g.stroke();
  }
  return c;
}
/* ── 竹叶 ── */
function leafCanvas() {
  const W = 128, H = 128, [c, g] = cv(W, H);
  g.fillStyle = '#4a7a3c'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(${40 + Math.random() * 50 | 0},${100 + Math.random() * 60 | 0},${40 + Math.random() * 30 | 0},.75)`;
    g.save(); g.translate(Math.random() * W, Math.random() * H); g.rotate(Math.random() * 6.3);
    g.beginPath(); g.ellipse(0, 0, 9, 2.6, 0, 0, 7); g.fill(); g.restore();
  }
  return c;
}

export const MAT = {};

export function initMaterials() {
  if (MAT.ready) return MAT;
  const tileC = tileCanvas(), plasterC = plasterCanvas(), stoneC = stoneCanvas(), woodC = woodCanvas();
  const paperC = paperCanvas(), leafC = leafCanvas(), waterN = waterNormalCanvas();

  const tileMap = tex(tileC, 3, 3); const tileBump = btex(tileC, 3, 3);
  const plasterMap = tex(plasterC, 2, 2); const plasterBump = btex(plasterC, 2, 2);
  const stoneMap = tex(stoneC, 4, 4); const stoneBump = btex(stoneC, 4, 4);
  const woodMap = tex(woodC, 1, 2);
  const paperMap = tex(paperC, 1, 1);
  const leafMap = tex(leafC, 2, 2);
  const waterNormal = btex(waterN, 5, 5);

  const std = (o) => new THREE.MeshStandardMaterial(o);

  MAT.wall = std({ color: 0xe7e0d2, map: plasterMap, bumpMap: plasterBump, bumpScale: .012, roughness: .92, metalness: 0 });
  MAT.wall2 = std({ color: 0xdcd4c4, map: plasterMap, bumpMap: plasterBump, bumpScale: .012, roughness: .94 });
  /* 瓦贴图自带明暗，颜色给中性，只做两档深浅区分 */
  MAT.tile = std({ color: 0xb4bac2, map: tileMap, bumpMap: tileBump, bumpScale: .03, roughness: .82, metalness: .02 });
  MAT.tile2 = std({ color: 0x98a0a9, map: tileMap, bumpMap: tileBump, bumpScale: .03, roughness: .86 });
  MAT.wood = std({ color: 0x6b4b34, map: woodMap, roughness: .84, metalness: .02 });
  MAT.woodDark = std({ color: 0x4a3223, map: woodMap, roughness: .88 });
  MAT.woodRed = std({ color: 0x8a3a2a, map: woodMap, roughness: .7 });
  MAT.stone = std({ color: 0x8d8c85, map: stoneMap, bumpMap: stoneBump, bumpScale: .02, roughness: .93 });
  MAT.stoneDark = std({ color: 0x6b6a63, map: stoneMap, bumpMap: stoneBump, bumpScale: .02, roughness: .95 });
  MAT.rock = std({ color: 0x7d7a72, roughness: .96, flatShading: true });
  /* 草地往黄绿偏：纯饱和草绿是"高尔夫球场"，江南是带土色的草 */
  MAT.ground = std({ color: 0x8a8a63, map: tex(groundCanvas('#7b7a53', '#a09a6d', 1400), 8, 8), roughness: .96 });
  MAT.dirt = std({ color: 0x8a7454, map: tex(groundCanvas('#7d6a4c', '#a08a63', 1200), 4, 4), roughness: .97 });
  MAT.paddy = std({ color: 0x8fa07c, map: tex(groundCanvas('#7d8f6b', '#a3b184', 1000), 3, 3), roughness: .95 });
  MAT.paddyWet = std({ color: 0x6f8f86, roughness: .22, metalness: .18 });
  MAT.water = new THREE.MeshStandardMaterial({
    color: 0x2f6b7a, roughness: .16, metalness: .28,
    normalMap: waterNormal, normalScale: new THREE.Vector2(.35, .35),
    transparent: true, opacity: .92
  });
  MAT.waterNormal = waterNormal;
  MAT.leaf = std({ color: 0x4e7a42, map: leafMap, roughness: .9, side: THREE.DoubleSide });
  MAT.leafDark = std({ color: 0x365c33, map: leafMap, roughness: .92, side: THREE.DoubleSide });
  MAT.leafPine = std({ color: 0x2f5c3c, map: leafMap, roughness: .9, side: THREE.DoubleSide });
  MAT.leafBamboo = std({ color: 0x7fa24e, map: leafMap, roughness: .85, side: THREE.DoubleSide });
  MAT.bark = std({ color: 0x5a4632, map: woodMap, roughness: .95 });
  MAT.paper = std({ color: 0xf6dfa8, map: paperMap, roughness: .9, emissive: 0xffca70, emissiveIntensity: .55 });
  MAT.lantern = std({ color: 0xd8452f, roughness: .7, emissive: 0xd8452f, emissiveIntensity: .9 });
  MAT.gold = std({ color: 0xc8a44a, roughness: .38, metalness: .78, emissive: 0x6a4d12, emissiveIntensity: .22 });
  MAT.brass = std({ color: 0xa8874a, roughness: .42, metalness: .7 });
  MAT.window = std({ color: 0x2a2f36, roughness: .4, metalness: .1, emissive: 0xffb765, emissiveIntensity: .7 });
  MAT.thatch = std({ color: 0xa8935f, roughness: .96 });
  MAT.glass = new THREE.MeshPhysicalMaterial({ color: 0xdfeef2, roughness: .08, transmission: .82, thickness: .04, transparent: true, opacity: .5 });
  MAT.snow = std({ color: 0xf2f5f8, roughness: .85 });
  MAT.portal = std({ color: 0x5fd6c0, roughness: .3, metalness: .2, emissive: 0x2ea78f, emissiveIntensity: 1.1, transparent: true, opacity: .85 });
  MAT.ready = true;
  return MAT;
}

/* 便捷：材质按名字取 */
export function M(name) {
  initMaterials();
  return MAT[name] || MAT.stone;
}
