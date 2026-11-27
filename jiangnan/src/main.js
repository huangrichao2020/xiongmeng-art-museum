/* 江南百村 · 主控
   一键生成 → 俯瞰/近观/环绕/沉浸 四种视角 → 传送门互通熊萌艺术馆 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateLayout, TYPE } from './core/layout.js';
import { initMaterials, MAT } from './core/materials.js';
import { initSky } from './core/sky.js';
import { initEffects } from './core/effects.js';
import { updateShared, sharedUniforms } from './core/patch.js';
import { windState } from './core/effects.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const qs = new URLSearchParams(location.search);
const APP = document.getElementById('app');

/* ── 渲染器 / 场景 ── */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
APP.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc6d6e2, 90, 420);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .3, 3200);

/* ── 画质档位 ──
   用户主要用手机。GTAO（环境光遮蔽）是"廉价体块感"的头号杀手，
   但在手机上很贵 —— 所以按设备分档：
     高：GTAO + FXAA + 4096 阴影   （桌面）
     中：FXAA + 4096 阴影 + 接地阴影贴片（手机默认）
   可以在左上栏里手动切。 */
const IS_TOUCH = matchMedia('(pointer:coarse)').matches;
const quality = { level: IS_TOUCH ? 'mid' : 'high' };
window.__jnQuality = quality;
camera.position.set(0, 150, 120);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.minDistance = 12;
controls.maxDistance = 420;
controls.maxPolarAngle = Math.PI * .495;
controls.target.set(0, 0, 0);

/* ── 后期链路：RenderPass → (GTAO) → OutputPass → FXAA ── */
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(devicePixelRatio, 2));
composer.setSize(innerWidth, innerHeight);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
let gtaoPass = null;
const outputPass = new OutputPass();
composer.addPass(outputPass);
const fxaaPass = new ShaderPass(FXAAShader);
composer.addPass(fxaaPass);
function syncFxaa() {
  const pr = renderer.getPixelRatio();
  fxaaPass.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
}
syncFxaa();
function applyQuality(level) {
  quality.level = level;
  const wantAO = level === 'high';
  if (wantAO && !gtaoPass) {
    gtaoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    /* 采样半径必须和场景尺度匹配：原来 radius .85m / thickness 1.0m，
       对 0.18m 厚的墙来说等于「把整面墙当薄片」，于是墙棱、山墙边、
       屋脊边被判定成大深度差 → 纯黑楔形伪影（关掉 GTAO 就消失）。
       半径收到 0.28m、厚度收到 0.45m，只留「贴着表面的接触阴影」，
       这才是我们想要的 AO，而不是大面积脏黑。 */
    gtaoPass.updateGtaoMaterial({
      radius: .28, distanceExponent: 1.0, thickness: .45,
      scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false,
    });
    gtaoPass.blendIntensity = .62;
    composer.insertPass(gtaoPass, 1);       /* 必须在 tone mapping 之前 */
  } else if (!wantAO && gtaoPass) {
    composer.removePass(gtaoPass);
    gtaoPass.dispose?.();
    gtaoPass = null;
  }
  /* 阴影精度：4096 贴图 + 收紧视锥（原来 2048 覆盖 ±120m，每 texel 11.7cm，屋檐全糊） */
  const mapSize = level === 'high' ? 4096 : 2048;
  const S = level === 'high' ? 110 : 96;
  if (sky && sky.sun) {
    sky.sun.shadow.mapSize.set(mapSize, mapSize);
    const c = sky.sun.shadow.camera;
    c.left = -S; c.right = S; c.top = S; c.bottom = -S;
    c.updateProjectionMatrix();
    if (sky.sun.shadow.map) { sky.sun.shadow.map.dispose(); sky.sun.shadow.map = null; }
  }
  syncFxaa();
}

/* ── 天色系统：真实大气散射天空 + 环境反射 + 时段联动 ──
   原来这里是「一盏平行光 + 一盏半球光 + 一盏补光」，材质没有环境反射，
   颜色全靠 albedo 硬画，所以瓦顶死黑、墙面灰绿 —— 塑料感的根源。
   现在天空用 Preetham 大气散射模型，PMREM 烘成环境贴图给 scene.environment。 */
const sky = initSky(renderer, scene);
applyQuality(quality.level);   /* sky 建好之后才能设阴影参数 */
scene.environmentIntensity = .34;   /* 环境光别压过太阳，不然没有明暗对比 */
sky.onChange = (h, label) => {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const clockEl = document.getElementById('jnClock');
  if (clockEl) clockEl.innerHTML = `<b>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</b> ${label}`;
  document.querySelectorAll('#jnHours button').forEach(b2 => {
    b2.classList.toggle('on', Math.abs(parseFloat(b2.dataset.hour) - h) < .6);
  });
  syncRemotes();
};

/* 远景（裙边 + 远山）的颜色全部由当前雾色推出来 → 换时段自动协调 */
function syncRemotes() {
  try {
    const r = world && world.getObjectByName('model-remotes');
    if (r && r.userData.setSky) {
      /* 夜色浓度：21 点最浓，晨昏居中，昼日为 0 */
      const h = sky ? sky.hour : 12;
      const night = h >= 17.5 || h <= 5.2
        ? Math.min(1, (h >= 17.5 ? (h - 17.5) / 3.5 : (5.2 - h) / 3.5))
        : 0;
      r.userData.setSky(scene.fog.color, night);
    }
  } catch (e) { /* world 还没建好，忽略 */ }
}

/* ── 状态 ── */
const MODEL_MODULES = ['terrain', 'water', 'roads', 'farmland', 'houses', 'trees', 'pagoda', 'paifang', 'props', 'people', 'remotes'];
let layout = null;
let world = new THREE.Group();
scene.add(world);
let effects = null;
let mode = 'over';
let walk = null;               // 沉浸模式状态
const clock = new THREE.Clock();
const _sunDir = new THREE.Vector3();

/* ── 生成一座村 ── */
async function buildVillage(seed) {
  world.clear();
  layout = generateLayout(seed);
  initMaterials();
  for (const name of MODEL_MODULES) {
    try {
      const mod = await import(`./models/${name}.js`);
      const g = mod.build(layout);
      if (g) { g.name = 'model-' + name; world.add(g); }
    } catch (e) {
      console.warn('[江南] 模型模块缺失或出错:', name, e && e.message);
    }
  }
  /* 环境动效（炊烟 / 萤火 / 落花）—— 重建村子时先摘掉旧的 */
  if (effects) { scene.remove(effects); effects = null; }
  effects = initEffects(scene, layout, world);
  paintStats();
  const nameEl = document.getElementById('railName');
  if (nameEl) nameEl.innerHTML = layout.landmark.name + '<small>JIANGNAN VILLAGE</small>';
  document.getElementById('seed').value = layout.seed;
  const u = new URL(location.href); u.searchParams.set('seed', layout.seed); history.replaceState(null, '', u);
  syncRemotes();
  applyMode(mode, true);
}

/* ── 视角 ── */
const MODES = {
  over: { name: '俯瞰', cam: [0, 118, 92], tgt: [0, 0, -4], fov: 44, auto: false },
  close: { name: '近观', cam: [26, 9, 34], tgt: [0, 3, 6], fov: 46, auto: false },
  orbit: { name: '环绕', cam: [0, 86, 96], tgt: [0, 0, 0], fov: 42, auto: true }
};
function applyMode(m, silent) {
  mode = m;
  document.querySelectorAll('#viewbar button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  if (m === 'walk') { enterWalk(); return; }
  exitWalk();
  controls.enabled = true;
  controls.autoRotate = (MODES[m] || MODES.over).auto;
  controls.autoRotateSpeed = .35;
  if (m === 'close') {
    /* 近观：低空斜俯，从村口往村子中心看。
       要点（都是实测出来的）：
       ① 机位必须在主路轴线上 —— 偏一点就撞进房子或牌坊里；
       ② 站在主路"有牌坊的那一端"往里推 24m（主路中段偏外），
          站在端头会正好怼在牌坊门洞里，屋里全是黑的横梁；
       ③ 机位高 8m：1.75m 的人眼会被两侧墙夹成一条缝，
          5m 只能看见山墙、看不见瓦面，8m 刚好"屋顶面 + 街面"都有；
       ④ 目标点几乎贴地（高 1m、推远 50m）→ 视线俯角约 8°，
          地平线被压到画面上三分之一，天空不至于占一半；
       ⑤ fov 50：再广两侧房子就贴到画框边缘，再窄又看不到远处的河和塔。
       没有牌坊的种子退回"离村中心最远的那一端"。 */
    const main = layout.roads.find(r => r.kind === 'main') || layout.roads[0];
    const cx = (main.x1 + main.x2) / 2, cz = (main.z1 + main.z2) / 2;
    const ends = [{ x: main.x1, z: main.z1 }, { x: main.x2, z: main.z2 }];
    /* 优先挑有牌坊的那一端 */
    let end = null;
    if (layout.paifangs && layout.paifangs.length) {
      let best = null, bd = Infinity;
      for (const e of ends) for (const p of layout.paifangs) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (bd < 40) end = best;
    }
    if (!end) {
      /* 退回：选离村中心更远的那一端 */
      end = Math.hypot(ends[0].x - cx, ends[0].z - cz) > Math.hypot(ends[1].x - cx, ends[1].z - cz) ? ends[0] : ends[1];
    }
    /* 往村中心方向看 */
    let dx = cx - end.x, dz = cz - end.z;
    const dl = Math.max(.001, Math.hypot(dx, dz));
    dx /= dl; dz /= dl;
    const sx = end.x + dx * 24, sz = end.z + dz * 24;
    camera.position.set(sx, 8, sz);
    controls.target.set(sx + dx * 50, 1, sz + dz * 50);
    camera.fov = 50; camera.updateProjectionMatrix();
  } else {
    const cfg = MODES[m] || MODES.over;
    camera.position.set(cfg.cam[0], cfg.cam[1], cfg.cam[2]);
    controls.target.set(cfg.tgt[0], cfg.tgt[1], cfg.tgt[2]);
    camera.fov = cfg.fov; camera.updateProjectionMatrix();
  }
  controls.update();
  if (!silent) toast(MODES[m] ? MODES[m].name : '');
}

/* ── 沉浸（第一人称行走）── */
const joyEl = document.getElementById('joystick'), stickEl = document.getElementById('stick');
const JOY_FULL = 46, JOY_DEAD = 6;
const joy = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0, pid: null };
function joyApply(x, y) {
  const dx = x - joy.ox, dy = y - joy.oy, len = Math.hypot(dx, dy);
  if (len < JOY_DEAD) { joy.dx = joy.dy = joy.mag = 0; stickEl.style.transform = 'translate(0,0)'; return; }
  const mag = Math.min(1, len / JOY_FULL);
  joy.dx = dx / len * mag; joy.dy = dy / len * mag; joy.mag = mag;
  const vis = Math.min(36, len);
  stickEl.style.transform = `translate(${dx / len * vis}px,${dy / len * vis}px)`;
}
function joyHide() { joy.active = false; joy.dx = joy.dy = joy.mag = 0; stickEl.style.transform = 'translate(0,0)'; joyEl.style.left = ''; joyEl.style.top = ''; }
function enterWalk() {
  document.body.classList.add('immersive');
  /* 提示条在沉浸模式下是藏的，用一次性浮层告诉玩家怎么走 */
  const tip = document.getElementById('walk-tip');
  if (tip) { tip.textContent = '左半屏拖动走路 · 右半屏拖动转头'; tip.classList.add('on');
    clearTimeout(enterWalk._t); enterWalk._t = setTimeout(() => tip.classList.remove('on'), 3200); }
  controls.enabled = false;
  walk = { x: layout ? 0 : 0, z: 0, y: 1.65, yaw: 0, pitch: -.06, keys: {} };
  /* 出生在主路中段 */
  const main = layout.roads.find(r => r.kind === 'main');
  if (main) { walk.x = (main.x1 + main.x2) / 2; walk.z = (main.z1 + main.z2) / 2; }
  const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
  camera.position.set(walk.x, walk.y, walk.z);
  camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
}
function exitWalk() {
  document.body.classList.remove('immersive');
  if (walk) { walk.keys = {}; }
  walk = null;
  joyHide();
}
/* 触屏：左半屏 = 走（手指按哪摇杆就出现在哪），右半屏 = 转头 */
const lookPts = new Map();
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || mode !== 'walk') return;
  const isMove = e.clientX < innerWidth * .5;
  lookPts.set(e.pointerId, { x: e.clientX, y: e.clientY, kind: isMove ? 'move' : 'look' });
  if (isMove) {
    joy.active = true; joy.pid = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
    const r = joyEl.getBoundingClientRect().width / 2;
    joyEl.style.left = (e.clientX - r) + 'px'; joyEl.style.top = (e.clientY - r) + 'px';
    joyEl.style.right = 'auto'; joyEl.style.bottom = 'auto';
  }
}, { passive: true });
renderer.domElement.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' || mode !== 'walk') return;
  const p = lookPts.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (p.kind === 'move') { if (joy.active && e.pointerId === joy.pid) joyApply(e.clientX, e.clientY); return; }
  walk.yaw -= dx * .0078;
  walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch - dy * .0078));
}, { passive: true });
addEventListener('pointerup', e => {
  lookPts.delete(e.pointerId);
  if (joy.active && e.pointerId === joy.pid) joyHide();
});
addEventListener('pointercancel', e => { lookPts.delete(e.pointerId); if (joy.active && e.pointerId === joy.pid) joyHide(); });
addEventListener('keydown', e => {
  if (!walk) return;
  walk.keys[e.code] = true;
});
addEventListener('keyup', e => { if (walk) walk.keys[e.code] = false; });

/* ── UI ── */
const statEl = document.getElementById('stats');
function paintStats() {
  const s = layout.stats;
  const pg = world.getObjectByName('model-people');
  const peopleN = (pg && pg.userData && pg.userData.people) ? pg.userData.people.count : 0;
  const rows = [
    [s.house, '民居'], [peopleN, '人物'], [s.field, '农田'], [s.tree, '树木'],
    [s.paifang, '牌坊'], [s.tower, '宝塔'], [s.water, '水系'], [s.road, '道路']
  ];
  statEl.innerHTML = rows.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
}
document.querySelectorAll('#viewbar button').forEach(b => {
  b.onclick = () => applyMode(b.dataset.mode);
});
/* 左上窄边栏：默认收成 ≡ + 时辰牌，点开才有内容（照熊萌艺术馆的 rail 做法） */
const railToggle = document.getElementById('railToggle');
const railClock = document.getElementById('jnClock');
if (railToggle) railToggle.onclick = () => document.body.classList.toggle('rail-min');
if (railClock) railClock.onclick = () => document.body.classList.remove('rail-min');

/* 时辰：滑杆连续调，四个预设按钮快速跳转 */
const hourSlider = document.getElementById('jnHour');
if (hourSlider) {
  hourSlider.oninput = () => sky.setHour(parseFloat(hourSlider.value));
  document.querySelectorAll('#jnHours button').forEach(b => {
    b.onclick = () => {
      const h = parseFloat(b.dataset.hour);
      sky.setHour(h);
      if (hourSlider) hourSlider.value = h;
    };
  });
}

/* 画质档位切换（手机默认流畅，桌面默认高） */
const qBtn = document.getElementById('btn-q');
function syncQBtn() {
  if (!qBtn) return;
  qBtn.textContent = '画质 ' + (quality.level === 'high' ? '高' : '流畅');
  qBtn.classList.toggle('on', quality.level === 'high');
}
if (qBtn) qBtn.onclick = () => {
  applyQuality(quality.level === 'high' ? 'mid' : 'high');
  syncQBtn();
  toast(quality.level === 'high' ? '高画质：环境光遮蔽 + 高精度阴影' : '流畅画质：更适合手机');
};
syncQBtn();

/* 回默认机位 */
const resetBtn = document.getElementById('btn-reset');
if (resetBtn) resetBtn.onclick = () => applyMode(mode === 'walk' ? 'orbit' : mode);

/* 村志：统计默认收起，点一下才显示 */
const statsEl = document.getElementById('stats');
const statsBtn = document.getElementById('btn-stats');
if (statsBtn) statsBtn.onclick = () => {
  const on = statsEl.style.display === 'none' || !statsEl.style.display;
  statsEl.style.display = on ? '' : 'none';
  statsBtn.classList.toggle('on', on);
};

document.getElementById('btn-new').onclick = () => {
  const seed = Math.floor(Math.random() * 1e9);
  buildVillage(seed);
  toast('新图景已生成');
};
document.getElementById('btn-seed').onclick = () => {
  const v = document.getElementById('seed').value.trim();
  const seed = /^\d+$/.test(v) ? parseInt(v, 10) : (v ? Array.from(v).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) : Math.floor(Math.random() * 1e9));
  buildVillage(seed);
  toast('图景已载入');
};
document.getElementById('wb-back').onclick = () => applyMode('orbit');

/* toast */
let toastT = null;
function toast(msg) {
  const el = document.getElementById('hintbar');
  if (!msg) return;
  el.innerHTML = msg;
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    el.innerHTML = '载入图景 · 清点完成 · <b>新一幅图景</b> 换一张 · <b>俯瞰/近观/环绕/沉浸</b> 切换 · 拖动旋转 · 滚轮缩放';
  }, 2600);
}

/* ── 主循环 ── */
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(.05, clock.getDelta());
  const t = clock.elapsedTime;
  /* 模型自带的动画 */
  world.traverse(o => { if (o.userData && o.userData.update) o.userData.update(t, dt); });
  if (mode === 'walk' && walk) {
    const f = (walk.keys['KeyW'] || walk.keys['ArrowUp'] ? 1 : 0) - (walk.keys['KeyS'] || walk.keys['ArrowDown'] ? 1 : 0);
    const s = (walk.keys['KeyD'] || walk.keys['ArrowRight'] ? 1 : 0) - (walk.keys['KeyA'] || walk.keys['ArrowLeft'] ? 1 : 0);
    let mf = f, ms = s;
    if (joy.mag > .02) { mf += -joy.dy; ms += joy.dx; }
    const sp = 7.2 * Math.max(1, Math.hypot(mf, ms));
    const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw), rx = Math.cos(walk.yaw), rz = -Math.sin(walk.yaw);
    walk.x += (fx * mf + rx * ms) * sp * dt;
    walk.z += (fz * mf + rz * ms) * sp * dt;
    walk.x = Math.max(layout.originX + 2, Math.min(-layout.originX - 2, walk.x));
    walk.z = Math.max(layout.originZ + 2, Math.min(-layout.originZ - 2, walk.z));
    camera.position.set(walk.x, walk.y, walk.z);
    camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  } else {
    controls.update();
  }
  sky.update(dt);
  /* 共享 uniforms：全场一棵树的摆动方向、透光方向都从这里来 */
  if (sky.sun) {
    _sunDir.copy(sky.sun.position).normalize();
    updateShared(t, windState(), _sunDir, camera);
  }
  if (effects) {
    /* 17:30 之后算入夜 —— 窗灯要跟着亮 */
    const night = sky.hour >= 17.5 || sky.hour <= 5.2;
    effects.userData.update(t, dt, night);
  }
  composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  syncFxaa();
  if (gtaoPass) gtaoPass.setSize(innerWidth, innerHeight);
});

/* ── 启动 ── */
(async () => {
  const seed = qs.get('seed');
  await buildVillage(seed && /^\d+$/.test(seed) ? parseInt(seed, 10) : Math.floor(Math.random() * 1e9));
  document.getElementById('loading').classList.add('gone');
  setTimeout(() => { const l = document.getElementById('loading'); if (l) l.remove(); }, 600);
  tick();
  /* 调试出口：探针用 */
  window.__jnReady = true;
  window.__jnLayout = layout;
  window.__jnScene = scene;
  window.__jnWorld = world;
  window.__jnCam = camera;
  window.__jnControls = controls;
  window.__jnSky = sky;
  window.__jnSetHour = (h) => sky.setHour(h, true);
  window.__jnWalk = () => walk;
  window.__jnMode = (m) => applyMode(m);
  window.__jnStats = () => ({
    seed: layout.seed, name: layout.landmark.name,
    house: layout.stats.house, field: layout.stats.field, tree: layout.stats.tree,
    paifang: layout.stats.paifang, tower: layout.stats.tower, road: layout.stats.road,
    water: layout.stats.water, prop: layout.stats.prop,
    people: (() => { const pg = world.getObjectByName('model-people');
      return pg && pg.userData && pg.userData.people ? pg.userData.people.count : 0; })(),
    towerDist: layout.tower ? layout.tower.minHouseDist : null,
    calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
    meshes: (() => { let c = 0; world.traverse(o => { if (o.isMesh) c++; }); return c; })(),
    groups: world.children.map(g => g.name)
  });
})();
