/* 江南古村 · 接地阴影（src/core/ao.js）
   ------------------------------------------------------------------
   场景看着"贴纸化"的最大原因：每个物件都是硬边坐在地面上，
   底下没有一点点变暗 → 眼睛判定它浮着 → 塑料玩具感。

   做法：在物件底部铺一张径向渐变贴片（中心黑、边缘全透），
   用 MultiplyBlending 跟地面相乘，等价于一张软 AO 贴片。
   一个物件一个 draw call 太多 —— 所以这里返回的是**共享几何 + 共享材质**，
   每个贴片用 matrix 缩放摆位，合并进各模型的静态批次里（instancedMerge）。

   用法：
     import { aoPatch } from '../core/ao.js';
     const a = aoPatch(1.6, .55);          // 半径 1.6m、强度 .55
     a.position.set(x, 0.02, z);            // 离地 2cm，z-fighting 保险
     bucket.push(a);                        // 交给模型的合批逻辑
   注意：MultiplyBlending 需要渲染顺序正确 —— 贴片必须不写深度、
   且在地面之后绘制。静态合批的模型请把它们放进单独的 ao 桶最后合并。
*/
import * as THREE from 'three';

/* 一张共享的径向渐变贴图：中心 0（黑=压暗），边缘 1（白=不改变） */
let _tex = null;
function radialTex() {
  if (_tex) return _tex;
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  /* 中心略亮一点点（最深的其实是 0.62 的灰），避免死黑一团 */
  grd.addColorStop(0.00, 'rgb(150,150,150)');
  grd.addColorStop(0.45, 'rgb(196,196,196)');
  grd.addColorStop(0.78, 'rgb(232,232,232)');
  grd.addColorStop(1.00, 'rgb(255,255,255)');
  g.fillStyle = grd;
  g.fillRect(0, 0, N, N);
  _tex = new THREE.CanvasTexture(cv);
  _tex.colorSpace = THREE.SRGBColorSpace;
  _tex.wrapS = _tex.wrapT = THREE.ClampToEdgeWrapping;
  return _tex;
}

/* 共享几何：单位圆盘（半径 1） */
let _geo = null;
function discGeo() {
  if (_geo) return _geo;
  _geo = new THREE.CircleGeometry(1, 20);
  _geo.rotateX(-Math.PI / 2);
  return _geo;
}

/* 共享材质：强度靠 material.opacity 控制不了 Multiply（乘的是贴图灰度），
   所以强度做进顶点色 —— 每个实例给不同的 vertexColor，Multiply 会乘上它。 */
const _mats = [];
function matFor(strength) {
  /* 按强度分几档缓存，避免 draw call 爆炸 */
  const step = 0.08;
  const key = Math.max(1, Math.min(12, Math.round(strength / step)));
  let m = _mats[key];
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: radialTex(),
      transparent: true,
      depthWrite: false,
      blending: THREE.MultiplyBlending,
      vertexColors: true,
      side: THREE.FrontSide,
      toneMapped: false,
    });
    m.userData.key = key;
    _mats[key] = m;
  }
  return m;
}

/* 造一片接地阴影贴片（半径 radius 米，强度 0~1） */
export function aoPatch(radius, strength = .5) {
  const g = discGeo().clone();
  /* 顶点色：中心按强度压暗，边缘恢复到白（1） */
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const s = 1 - Math.max(0, Math.min(1, strength));
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / radius;   /* 0..1 */
    const k = 1 - (1 - s) * Math.max(0, 1 - r * r);             /* 中心 s，边缘 1 */
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, matFor(strength));
  m.scale.setScalar(radius);
  m.renderOrder = 2;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

/* 批量：给一批位置铺接地阴影（同一个桶里合批，只多 1 个 draw call）
   pts: [{x, z, r, s}] */
export function aoBatch(pts, material) {
  const geos = [];
  for (const p of pts) {
    const g = discGeo().clone();
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const s = 1 - Math.max(0, Math.min(1, p.s == null ? .5 : p.s));
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const k = 1 - (1 - s) * Math.max(0, 1 - r * r);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Matrix4().makeTranslation(p.x, 0.02, p.z).scale(new THREE.Vector3(p.r || 1, 1, p.r || 1));
    g.applyMatrix4(m);
    geos.push(g);
  }
  return geos;
}
