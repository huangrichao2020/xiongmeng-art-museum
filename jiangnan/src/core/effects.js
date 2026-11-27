/* 江南古村 · 环境动效（src/core/effects.js）
   ------------------------------------------------------------------
   静态场景会显得像"摆件"。这几样东西一动，村子就有了生活气：

   ① 炊烟：几户人家的屋顶上冒出的烟柱。烟用一串半透明面片往上飘，
      越飘越大越淡，并被风推歪 —— 风是用一个全局的风向量带动的。
   ② 萤火虫：只在黄昏后出现，在村边的树丛里慢慢漂，偶尔闪一下。
   ③ 落花：白天偶尔飘几片花瓣/落叶，打着旋往下落，落地就没了。

   全部走 Points / 小面片，合批后每样只多 1~2 个 draw call。
   随机数一律用 makeRng，同 seed 必得同一张图。
*/
import * as THREE from 'three';
import { makeRng } from './rng.js';

/* 风的全局向量（会缓慢转向） */
const wind = { x: 0.55, z: 0.35, strength: 1, t: 0 };
export function windState() { return wind; }

/* ── 炊烟 ───────────────────────────────────────────────── */
function buildSmoke(layout, rng, world) {
  const houses = layout.houses || [];
  if (!houses.length) return null;
  /* 烟从烟囱口冒出来。houses.js 那边把每栋房的烟囱位置与顶高写进了
     group.userData.chimneys（它复刻了这里的 rng 消费次序，所以两边对得上）。
     直接用那份清单：① 位置准；② 起点高度跟着屋脊走，
     二层房不再从一层墙面冒烟（原来写死 4.6~6.2m）。
     找不到清单时才退回旧算法。 */
  const hs = world && world.getObjectByName('model-houses');
  const chimneys = (hs && hs.userData && hs.userData.chimneys) || null;
  const picks = [];
  if (chimneys && chimneys.length) {
    for (const c of chimneys) {
      rng(); rng(); rng();                 /* 保持与旧算法相同的 rng 消费次数 */
      const s = rng();
      picks.push({ x: c.x, z: c.z, y: (c.chimneyTop || c.smokeY || 5) + .06, s: .8 + s * .6 });
    }
  } else {
    /* 挑几户人家（错开，别挤在一处） */
    const step = Math.max(1, Math.floor(houses.length / 7));
    for (let i = 0; i < houses.length && picks.length < 7; i += step) {
      const h = houses[i];
      picks.push({ x: h.x + (rng() - .5) * 1.2, z: h.z + (rng() - .5) * 1.2, y: 4.6 + rng() * 1.6, s: .8 + rng() * .6 });
    }
  }
  const PER = 34;                   /* 每根烟柱的烟点个数 */
  const COUNT = picks.length * PER;
  /* 用点精灵而不是面片：面片叠在一起底部会叠成一根「实心白柱」，
     一眼假。点精灵可以逐点给透明度，越飘越散、越飘越淡。 */
  const pos = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT);
  const alpha = new Float32Array(COUNT);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(0xcfc9bd) },
      uOpacity: { value: .55 }
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * 320.0 / max(0.001, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.08, r) * vAlpha * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Points(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  const data = [];
  for (const p of picks) {
    for (let i = 0; i < PER; i++) {
      data.push({
        ox: p.x, oy: p.y, oz: p.z, s: p.s,
        ph: rng(),                      /* 相位 */
        sp: .10 + rng() * .07,          /* 上升速度（m/s） */
        sw: .35 + rng() * .55,          /* 摆幅 */
        rot: rng() * Math.PI * 2,
        jx: (rng() - .5) * .5, jz: (rng() - .5) * .5   /* 出烟口抖动 */
      });
    }
  }
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.update = (t, dt, night) => {
    wind.t += dt;
    const P = geo.attributes.position.array;
    const SZ = geo.attributes.aSize.array;
    const AL = geo.attributes.aAlpha.array;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const k = (t * d.sp + d.ph) % 1;          /* 0..1 生命周期 */
      const rise = 5.0 * k;                    /* 一根烟最多飘 5 米 */
      /* 风推：越高飘得越远。斜着飘才不会在俯视时连成一根白竖线 */
      const drift = k * k * 9.5 * wind.strength;
      const wob = Math.sin(t * .8 + d.ph * 9) * d.sw * (0.3 + k);
      P[i * 3] = d.ox + d.jx + wind.x * drift + wob;
      P[i * 3 + 1] = d.oy + rise;
      P[i * 3 + 2] = d.oz + d.jz + wind.z * drift + wob * .5;
      SZ[i] = (0.9 + k * 2.6) * d.s;
      /* 刚出烟口最实，飘高了迅速散掉 */
      AL[i] = Math.max(0, (1 - k * k) * (0.22 + 0.78 * Math.min(1, k * 6)));
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    /* 夜里烟要更暗，否则会发亮 */
    const c = mat.uniforms.uColor.value;
    c.setHex(night ? 0x5c6168 : 0xcfc9bd);
    mat.uniforms.uOpacity.value = night ? .28 : .38;
  };
  return group;
}

/* ── 萤火虫（只在黄昏后亮） ─────────────────────────────── */
function buildFireflies(layout, rng) {
  const trees = layout.trees || [];
  const pts = [];
  const N = 90;
  for (let i = 0; i < N; i++) {
    const t = trees.length ? trees[Math.floor(rng() * trees.length)] : { x: (rng() - .5) * 60, z: (rng() - .5) * 60 };
    pts.push({
      x: t.x + (rng() - .5) * 5, z: t.z + (rng() - .5) * 5,
      y: .8 + rng() * 2.6,
      ph: rng() * 6.28, sp: .25 + rng() * .4,
      r: 1.2 + rng() * 2.4,
      blink: 1.6 + rng() * 2.4,
    });
  }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: .30, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: .0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  const group = new THREE.Group();
  group.add(points);
  group.userData.update = (t, dt, night) => {
    const target = night ? 1 : 0;
    mat.opacity += (target - mat.opacity) * Math.min(1, dt * 1.6);
    if (mat.opacity < .01) return;
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      pos[i * 3] = p.x + Math.sin(t * p.sp + p.ph) * p.r;
      pos[i * 3 + 1] = p.y + Math.sin(t * p.sp * .7 + p.ph * 1.3) * .5;
      pos[i * 3 + 2] = p.z + Math.cos(t * p.sp * .8 + p.ph) * p.r;
      /* 闪烁：暗→亮→暗 */
      const bl = .35 + .65 * Math.pow(Math.max(0, Math.sin(t * p.blink + p.ph)), 3);
      col[i * 3] = 1.0 * bl;
      col[i * 3 + 1] = .88 * bl;
      col[i * 3 + 2] = .42 * bl;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return group;
}

/* ── 落花（白天飘花瓣） ─────────────────────────────────── */
function buildPetals(layout, rng) {
  const N = 70;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: .13, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: .0, depthWrite: false, toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  const data = [];
  const half = (layout.W * layout.cell) / 2;
  for (let i = 0; i < N; i++) {
    data.push({
      x: (rng() - .5) * half * 1.6, z: (rng() - .5) * half * 1.6,
      y: 2 + rng() * 14, sp: .5 + rng() * .7,
      ph: rng() * 6.28, sw: .6 + rng() * 1.1,
      warm: rng() > .55,
    });
  }
  const group = new THREE.Group();
  group.add(points);
  group.userData.update = (t, dt, night) => {
    const target = night ? 0 : .8;
    mat.opacity += (target - mat.opacity) * Math.min(1, dt * .8);
    if (mat.opacity < .01) return;
    for (let i = 0; i < N; i++) {
      const p = data[i];
      /* 落地就重新从高处落下 */
      p.y -= p.sp * dt;
      if (p.y < .1) { p.y = 9 + (i % 7); }
      const sx = p.x + Math.sin(t * p.sw + p.ph) * 1.5 + wind.x * t * .6;
      const sz = p.z + Math.cos(t * p.sw * .8 + p.ph) * 1.5 + wind.z * t * .6;
      pos[i * 3] = sx;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = sz;
      if (p.warm) { col[i * 3] = .95; col[i * 3 + 1] = .72; col[i * 3 + 2] = .60; }
      else { col[i * 3] = .95; col[i * 3 + 1] = .92; col[i * 3 + 2] = .86; }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return group;
}

/* ── 窗灯 ─────────────────────────────────────────────────
   熊萌艺术馆"漂亮"的关键不是天光，是**大量暖色点光**做局部照明：
   夜里一盏盏窗灯亮着，村子才有生活气。
   这里给部分民居的窗口挂暖色点灯，白天全灭，傍晚渐亮。 */
function buildWindowLights(layout, rng) {
  const houses = layout.houses || [];
  if (!houses.length) return null;
  const group = new THREE.Group();
  const lights = [];
  const step = Math.max(1, Math.floor(houses.length / 16));
  for (let i = 0; i < houses.length && lights.length < 16; i += step) {
    const h = houses[i];
    const l = new THREE.PointLight(0xffb765, 0, 11, 1.9);
    l.position.set(h.x + (rng() - .5) * 1.2, 2.05, h.z + (rng() - .5) * 1.2);
    l.visible = false;
    group.add(l);
    lights.push({ l, base: 2.6 + rng() * 2.2, ph: rng() * 6.28 });
  }
  group.userData.update = (t, dt, night) => {
    /* 傍晚 17:30 起渐亮，夜里最亮 */
    const target = night ? 1 : 0;
    for (const it of lights) {
      it.l.intensity += (it.base * target - it.l.intensity) * Math.min(1, dt * 1.1);
      it.l.visible = it.l.intensity > 0.02;
      /* 灯焰轻微跳动 */
      if (it.l.visible) it.l.intensity *= 0.94 + 0.06 * Math.sin(t * 7 + it.ph) + 0.03 * Math.sin(t * 17 + it.ph);
    }
  };
  return group;
}

/* ── 主入口 ─────────────────────────────────────────────── */
export function initEffects(scene, layout, world) {
  const rng = makeRng(((layout.seed | 0) ^ 0x51ed) >>> 0);
  const group = new THREE.Group();
  group.name = 'jn-effects';

  const winLights = buildWindowLights(layout, rng);
  const smoke = buildSmoke(layout, rng, world);
  const flies = buildFireflies(layout, rng);
  const petals = buildPetals(layout, rng);
  if (winLights) group.add(winLights);
  if (smoke) group.add(smoke);
  if (flies) group.add(flies);
  if (petals) group.add(petals);
  scene.add(group);

  group.userData.update = (t, dt, night) => {
    /* 风：方向缓慢摆动 */
    wind.t += dt;
    const a = Math.sin(t * .07) * .9 + .6;
    wind.x = Math.cos(a) * wind.strength;
    wind.z = Math.sin(a) * wind.strength * .7;
    if (winLights) winLights.userData.update(t, dt, night);
    if (smoke) smoke.userData.update(t, dt, night);
    if (flies) flies.userData.update(t, dt, night);
    if (petals) petals.userData.update(t, dt, night);
  };
  return group;
}
