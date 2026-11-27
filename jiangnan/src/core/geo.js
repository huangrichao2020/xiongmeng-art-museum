/* 江南古村 · 通用几何工具（所有模型模块共用，保证同一个"国风"味）
   屋顶是参数化曲面：屋脊 → 坡面 → 檐口起翘，瓦垄按"一压一叠"的坡道排布，
   不是一块斜面。 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { mergeGeometries };

/* 非索引化：three 的 toNonIndexed() 对已经非索引的几何会打
   "BufferGeometry is already non-indexed." 警告。统一走这个 helper。 */
export function nonIndexed(g) {
  return g && g.index ? g.toNonIndexed() : g;
}

/* 参数曲面：fn(u,v) → [x,y,z] */
export function paramSurface(fn, nu, nv, opt = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  /* uvScale：把参数化 UV 换成"每米多少个贴图周期"。
     不给就是原来的 0~1 参数化 —— 但屋顶/墙面这种大面，
     0~1 会把一张瓦图拉满整个面，瓦垄全糊成一片黑。 */
  const us = opt.uvScale || null;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    const p = fn(u, v);
    pos.push(p[0], p[1], p[2]);
    nor.push(0, 1, 0);
    if (us) {
      /* 用 x/z 的世界尺度算 UV（屋面是斜的，用水平投影即可，
         瓦垄是沿坡向排的，横着贴不影响条纹方向） */
      uv.push(p[0] / us, p[2] / us);
    } else {
      uv.push(u, v);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* 单坡曲面（带起翘），side=+1/-1；offset 沿法线外推，用来做瓦垄台阶 */
function slopeSurface(W, D, h, side, courses, nu, lift, curve) {
  const nv = courses * 2;
  return paramSurface((u, v) => {
    const x = (u - .5) * W;
    const t = v;
    const z = side * (D / 2) * t;
    const corner = Math.pow(Math.abs(x) / (W / 2), 2.6);       // 越靠山墙边越翘
    const y = h * (1 - t) + curve * corner * t * t * 1.6;
    /* 瓦垄台阶：每一"压"的底边往外挑一点 */
    const courseF = (t * courses) % 1;
    const step = lift * courseF;
    const nz = side * step * .8, ny = step * .35;
    return [x, y + ny, z + nz];
  }, nu, nv, { uvScale: 1.35, uvAxis: 'xz' });   // 1.35m 一个贴图周期 → 一张瓦图 8 垄 × 8 压，屋面上能数出瓦来
}

/* 硬山/悬山屋顶：双坡 + 正脊 + 瓦垄 + 檐口起翘
   w,d = 屋面宽深（米），h = 屋脊高（米） */
export function gableRoofGeo(w, d, h, opt = {}) {
  const over = opt.overhang ?? .36;
  const courses = opt.courses ?? 7;
  const nu = opt.nu ?? 10;
  const curve = opt.curve ?? .30;
  const W = w + over * 2, D = d + over * 2;
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(slopeSurface(W, D, h, s, courses, nu, opt.lift ?? .05, curve));
  }
  /* 正脊：一条压顶 */
  const ridge = new THREE.BoxGeometry(W + .1, .16, .30);
  ridge.translate(0, h + .02, 0);
  parts.push(ridge);
  /* 脊两端的翘角（吞脊） */
  for (const sx of [-1, 1]) {
    const horn = new THREE.BoxGeometry(.5, .12, .18);
    horn.translate(sx * (W / 2 - .2), h + .14, 0);
    horn.rotateZ(sx * .06);
    parts.push(horn);
  }
  const g = mergeGeometries(parts.map(nonIndexed), false);
  fixUpNormals(g);
  return g;
}

/* 修正法线朝向：坡面的三角形绕序在不同 side 下会反，
   computeVertexNormals 就算出一半朝下的法线 —— 那半边屋顶完全不受光，
   远看就是一块纯黑。逐面判断：法线朝下就翻过来。 */
export function fixUpNormals(g) {
  const n = g.attributes.normal;
  if (!n) return g;
  const p = g.attributes.position;
  /* 逐三角形处理（非索引几何每 3 个顶点一个面） */
  for (let t = 0; t + 2 < n.count; t += 3) {
    const ny = n.getY(t) + n.getY(t + 1) + n.getY(t + 2);
    if (ny < 0) {
      for (let k = 0; k < 3; k++) {
        n.setXYZ(t + k, -n.getX(t + k), -n.getY(t + k), -n.getZ(t + k));
      }
    }
  }
  n.needsUpdate = true;
  return g;
}

/* 四坡顶（歇山/庑殿的简化）——用于宝塔、等级更高的房 */
export function hipRoofGeo(w, d, h, opt = {}) {
  const over = opt.overhang ?? .42;
  const courses = opt.courses ?? 6;
  const nu = opt.nu ?? 10;
  const W = w + over * 2, D = d + over * 2;
  const parts = [];
  /* 四坡：对角线方向的坡面，用 u 决定是哪个坡 */
  parts.push(paramSurface((u, v) => {
    const t = v;
    const x = (u - .5) * W;
    const z = (t - .5) * D;
    const shrink = 1 - t;                       // 向脊收
    const y = h * (1 - Math.abs(t - .5) * 2) * 0 + h * (1 - t);
    return [x * (1 - t * .06), y, z];
  }, nu, courses * 2));
  const ridge = new THREE.BoxGeometry(W * .42, .14, .26);
  ridge.translate(0, h + .02, 0);
  parts.push(ridge);
  const g = mergeGeometries(parts.map(nonIndexed), false);
  fixUpNormals(g);
  return g;
}

/* 马头墙：阶梯状山墙轮廓（Shape + 挤出） */
export function steppedGableGeo(w, h, opt = {}) {
  const thick = opt.thick ?? .22;
  const steps = opt.steps ?? 3;
  const dir = opt.dir ?? 1;                     // 1=山墙朝 +x
  const s = new THREE.Shape();
  const half = w / 2;
  s.moveTo(-half, 0);
  s.lineTo(-half, h * .55);
  const seg = h * .45 / steps;
  let x = -half, y = h * .55;
  for (let i = 0; i < steps; i++) {
    s.lineTo(x + half / steps * .55, y);
    s.lineTo(x + half / steps * .55, y + seg * .55);
    s.lineTo(x + half / steps, y + seg * .55);
    y += seg * .55; x += half / steps;
  }
  s.lineTo(half, y);
  s.lineTo(half, 0);
  s.lineTo(-half, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  if (dir < 0) g.scale(-1, 1, 1);
  g.computeVertexNormals();
  return g;
}

/* 勒脚：墙脚的青砖基座 */
export function plinthGeo(w, d, h = .42) {
  const g = new THREE.BoxGeometry(w + .12, h, d + .12);
  g.translate(0, h / 2, 0);
  return g;
}

/* 板门 + 门框 + 抱鼓石 */
export function doorGeo(w = 1.05, h = 2.05) {
  const parts = [];
  const leaf = new THREE.BoxGeometry(w, h, .07);
  leaf.translate(0, h / 2, 0);
  parts.push(leaf);
  /* 中缝（双开门） */
  const seam = new THREE.BoxGeometry(.035, h, .09);
  seam.translate(0, h / 2, .01);
  parts.push(seam);
  /* 门簪 */
  for (const sx of [-1, 1]) for (const sy of [.78, .58]) {
    const d = new THREE.CylinderGeometry(.055, .055, .09, 8);
    d.rotateX(Math.PI / 2);
    d.translate(sx * w * .26, h * sy, .06);
    parts.push(d);
  }
  return mergeGeometries(parts.map(nonIndexed), false);
}

/* 木格窗 + 窗纸 */
export function windowFrameGeo(w = 1.15, h = .95, bars = 3) {
  const parts = [];
  const t = .075;
  const top = new THREE.BoxGeometry(w + .18, t, .12); top.translate(0, h + .07, 0); parts.push(top);
  const bot = new THREE.BoxGeometry(w + .18, t, .12); bot.translate(0, -.05, 0); parts.push(bot);
  const l = new THREE.BoxGeometry(t, h + .12, .12); l.translate(-w / 2 - .075, h / 2, 0); parts.push(l);
  const r = new THREE.BoxGeometry(t, h + .12, .12); r.translate(w / 2 + .075, h / 2, 0); parts.push(r);
  for (let i = 1; i < bars; i++) {
    const b = new THREE.BoxGeometry(.045, h, .09); b.translate(-w / 2 + w * i / bars, h / 2, 0); parts.push(b);
  }
  for (let i = 1; i <= 2; i++) {
    const b = new THREE.BoxGeometry(w, .045, .09); b.translate(0, h * i / 3, 0); parts.push(b);
  }
  return mergeGeometries(parts.map(nonIndexed), false);
}

/* 灯笼（纸罩 + 上下盖 + 穗子） */
export function lanternGeo(r = .17) {
  const parts = [];
  const body = new THREE.SphereGeometry(r, 12, 9);
  body.scale(1, .86, 1);
  parts.push(body);
  const capT = new THREE.CylinderGeometry(r * .46, r * .56, .07, 10); capT.translate(0, r * .78, 0); parts.push(capT);
  const capB = new THREE.CylinderGeometry(r * .5, r * .42, .06, 10); capB.translate(0, -r * .74, 0); parts.push(capB);
  const tas = new THREE.ConeGeometry(r * .18, .22, 6); tas.translate(0, -r * .95, 0); parts.push(tas);
  return { paper: mergeGeometries(parts.map(nonIndexed), false), cap: null };
}

/* 合并成一个 mesh */
export function meshOf(geos, mat, x = 0, y = 0, z = 0, rotY = 0) {
  const g = geos.length === 1 ? geos[0] : mergeGeometries(geos.map(nonIndexed), false);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z); m.rotation.y = rotY;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* 批量：把同一个几何体复制 N 份并合成一个 mesh（省 draw call） */
export function instancedMerge(geo, count, placeFn, mat) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    placeFn(d, i);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* 平面贴地：一张带轻微起伏的地皮 */
export function groundPlane(w, d, seg = 24, heightFn = null) {
  const g = new THREE.PlaneGeometry(w, d, seg, seg);
  g.rotateX(-Math.PI / 2);
  if (heightFn) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, heightFn(x, z));
    }
    g.computeVertexNormals();
  }
  return g;
}
