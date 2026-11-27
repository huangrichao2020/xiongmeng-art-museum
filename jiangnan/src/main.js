/* 江南百村 · 主控
   一键生成 → 俯瞰/近观/环绕/沉浸 四种视角 → 传送门互通熊萌艺术馆 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateLayout, TYPE } from './core/layout.js';
import { initMaterials, MAT } from './core/materials.js';

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
scene.background = new THREE.Color(0xcfdce6);
scene.fog = new THREE.Fog(0xc6d4de, 190, 520);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .3, 1400);
camera.position.set(0, 150, 120);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.minDistance = 12;
controls.maxDistance = 420;
controls.maxPolarAngle = Math.PI * .495;
controls.target.set(0, 0, 0);

/* ── 光：晨光 + 天光 + 一盏补光 ── */
const hemi = new THREE.HemisphereLight(0xcfe0ee, 0x6d7a4c, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.15);
sun.position.set(96, 128, 62);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 40;
sun.shadow.camera.far = 420;
const S = 120;
sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
sun.shadow.bias = -.0009;
sun.shadow.normalBias = .035;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa8c4dd, .45);
fill.position.set(-70, 60, -80);
scene.add(fill);

/* ── 状态 ── */
const MODEL_MODULES = ['terrain', 'water', 'roads', 'farmland', 'houses', 'trees', 'pagoda', 'paifang', 'props', 'people', 'portal'];
let layout = null;
let world = new THREE.Group();
scene.add(world);
let portals = [];
let mode = 'over';
let walk = null;               // 沉浸模式状态
const clock = new THREE.Clock();

/* ── 生成一座村 ── */
async function buildVillage(seed) {
  world.clear();
  portals = [];
  layout = generateLayout(seed);
  initMaterials();
  for (const name of MODEL_MODULES) {
    try {
      const mod = await import(`./models/${name}.js`);
      if (name === 'portal' && Array.isArray(mod.PORTALS)) portals = mod.PORTALS;
      const g = mod.build(layout);
      if (g) { g.name = 'model-' + name; world.add(g); }
    } catch (e) {
      console.warn('[江南] 模型模块缺失或出错:', name, e && e.message);
    }
  }
  /* 地形若有起伏，把太阳阴影范围重新对齐 */
  scene.fog.color.set(0xc6d4de);
  paintStats();
  paintMinimap();
  document.getElementById('landmark').textContent = layout.landmark.name;
  document.getElementById('landsub').textContent = layout.landmark.sub;
  document.getElementById('seed').value = layout.seed;
  const u = new URL(location.href); u.searchParams.set('seed', layout.seed); history.replaceState(null, '', u);
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
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
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
  if (e.code === 'KeyE') tryPortal();
});
addEventListener('keyup', e => { if (walk) walk.keys[e.code] = false; });

/* ── 传送门 ── */
const PORTAL_R = 2.6;          /* 触发半径（米） */
function portalNear() {
  if (!walk || !portals.length) return null;
  for (const p of portals) {
    if (Math.hypot(walk.x - p.x, walk.z - p.z) < PORTAL_R) return p;
  }
  return null;
}
function tryPortal() {
  const p = portalNear();
  if (!p) return;
  const u = new URL(p.target);
  u.searchParams.set('from', 'jiangnan');
  location.href = u.toString();
}
/* 手机上没有 E 键 —— 靠近法阵时在右下角亮一个按钮 */
const portalBtn = document.getElementById('wb-portal');
if (portalBtn) portalBtn.onclick = (e) => { e.stopPropagation(); tryPortal(); };

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
document.querySelectorAll('#modes button').forEach(b => {
  b.onclick = () => applyMode(b.dataset.mode);
});
/* 手机端面板：默认只留顶部一条，点"图景"展开抽屉 */
const panelEl = document.getElementById('panel');
const moreBtn = document.getElementById('btn-more');
function closePanel() {
  if (!panelEl) return;
  panelEl.classList.remove('open');
  if (moreBtn) { moreBtn.classList.remove('on'); moreBtn.textContent = '图景'; }
}
if (moreBtn) moreBtn.onclick = () => {
  const open = panelEl.classList.toggle('open');
  moreBtn.classList.toggle('on', open);
  moreBtn.textContent = open ? '收起' : '图景';
};
document.getElementById('btn-new').onclick = () => {
  const seed = Math.floor(Math.random() * 1e9);
  buildVillage(seed);
  toast('新图景已生成');
  closePanel();
};
document.getElementById('btn-seed').onclick = () => {
  const v = document.getElementById('seed').value.trim();
  const seed = /^\d+$/.test(v) ? parseInt(v, 10) : (v ? Array.from(v).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) : Math.floor(Math.random() * 1e9));
  buildVillage(seed);
  toast('图景已载入');
  closePanel();
};
document.getElementById('wb-back').onclick = () => applyMode('orbit');

/* 小地图 */
const miniCv = document.getElementById('minimap');
const mctx = miniCv.getContext('2d');
function paintMinimap() {
  const W = layout.W, H = layout.H, S = miniCv.width / W;
  mctx.clearRect(0, 0, miniCv.width, miniCv.height);
  mctx.fillStyle = '#ded3b6'; mctx.fillRect(0, 0, miniCv.width, miniCv.height);
  const cellPx = c => c * S;
  /* 田 */
  mctx.fillStyle = '#b9c493';
  for (const f of layout.fields) mctx.fillRect(cellPx(f.gx), cellPx(f.gz), cellPx(f.w), cellPx(f.h));
  /* 树 */
  mctx.fillStyle = 'rgba(70,110,60,.45)';
  for (const t of layout.trees) mctx.fillRect(cellPx(t.x / layout.cell - .5) - 1, cellPx(t.z / layout.cell - .5) - 1, 2, 2);
  /* 路 */
  mctx.strokeStyle = '#c8b48c'; mctx.lineCap = 'round';
  for (const r of layout.roads) {
    mctx.lineWidth = Math.max(1.4, (r.kind === 'main' ? 3.4 : r.kind === 'stone' ? 2.2 : 1.4));
    mctx.beginPath(); mctx.moveTo(r.x1 / layout.cell * S, r.z1 / layout.cell * S);
    mctx.lineTo(r.x2 / layout.cell * S, r.z2 / layout.cell * S); mctx.stroke();
  }
  /* 河 */
  mctx.strokeStyle = '#7fa9bd'; mctx.lineCap = 'butt';
  for (const r of layout.rivers) {
    mctx.lineWidth = Math.max(3, r.w / layout.cell * S);
    mctx.beginPath(); mctx.moveTo(r.x1 / layout.cell * S, r.z1 / layout.cell * S);
    mctx.lineTo(r.x2 / layout.cell * S, r.z2 / layout.cell * S); mctx.stroke();
  }
  /* 房 */
  mctx.fillStyle = '#3a3227';
  for (const h of layout.houses) mctx.fillRect(cellPx(h.gx), cellPx(h.gz), Math.max(2, h.w * S - .6), Math.max(2, h.d * S - .6));
  /* 牌坊 / 塔 */
  mctx.fillStyle = '#a8342a';
  for (const p of layout.paifangs) { mctx.beginPath(); mctx.arc(cellPx(p.gx + .5), cellPx(p.gz + .5), 3, 0, 7); mctx.fill(); }
  if (layout.tower) {
    mctx.fillStyle = '#c8a44a';
    mctx.beginPath(); mctx.arc(cellPx(layout.tower.gx + .5), cellPx(layout.tower.gz + .5), 4, 0, 7); mctx.fill();
  }
  /* 传送门 */
  mctx.fillStyle = '#2ea78f';
  for (const p of portals) { mctx.beginPath(); mctx.arc(p.x / layout.cell * S, p.z / layout.cell * S, 3.5, 0, 7); mctx.fill(); }
  document.getElementById('mini-scale').textContent = layout.W * layout.cell + 'm 见方';
}
function paintMiniPos() {
  const el = document.getElementById('mini-pos');
  if (!layout) return;
  const x = camera.position.x, z = camera.position.z;
  const gx = (x - layout.originX) / layout.cell, gz = (z - layout.originZ) / layout.cell;
  el.textContent = `${gx.toFixed(0)}, ${gz.toFixed(0)}`;
  const S = miniCv.width / layout.W;
  mctx.fillStyle = '#a8342a';
  mctx.beginPath(); mctx.arc(gx * S, gz * S, 3.4, 0, 7); mctx.fill();
}

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
    /* 这里不要自动 tryPortal —— 走近法阵就被弹走的话，
       手机上根本没机会看清那扇水墨门。改成亮出右下角的按钮，由玩家主动点。 */
  } else {
    controls.update();
  }
  if (portalBtn) {
    const pn = portalNear();
    if (pn) {
      portalBtn.hidden = false;
      /* 64px 圆钮塞不下 6 个字，'回熊萌艺术馆' 会折成两行 */
      portalBtn.textContent = '回' + String(pn.label || '上一处').replace('熊萌', '');
    } else portalBtn.hidden = true;
  }
  if (t - (paintMiniPos._t || 0) > .12) { paintMiniPos._t = t; paintMiniPos(); }
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
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
  window.__jnPortals = () => portals;
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
