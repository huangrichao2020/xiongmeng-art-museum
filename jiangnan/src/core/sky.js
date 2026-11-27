/* 江南古村 · 天色系统（src/core/sky.js）
   ------------------------------------------------------------------
   这一层解决的是"塑料感"的根：场景原来只有一个固定雾色 + 一盏平行光，
   材质没有环境反射，颜色管理也没开，所以瓦顶是死黑、墙是灰绿。

   做法：
   ① 用 three 官方的 Sky（Preetham 大气散射模型）当天穹 —— 真实的天空颜色，
      随太阳高度角自然从暖橘晨光转到正午青白再到暮色紫红。
   ② 用 PMREMGenerator 把天穹烘成环境贴图，赋给 scene.environment
      → 瓦面、水面、陶缸、铜器都有了环境反射，这是"不塑料"最关键的一步。
   ③ 平行光当太阳，颜色/强度按阶段给；夜间换成冷色月光 + 屋里暖灯更突出。
   ④ 雾色跟着天色走（远山要"化"进天里，不能是一条灰蓝墙）。
   ⑤ 颜色管理：ACESFilmic 色调映射 + 曝光，配合 sRGB 输出。

   时段：晨 6.4 / 昼 12 / 昏 17.7 / 夜 21，滑杆可连续调。
   太阳方位：东升西落，方位角随时间从 -100° 走到 +100°，高度角按 sin 曲线。
*/
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/* 四个时段的观感参数（不是物理模拟，是美术定向） */
const PHASES = {
  dawn: { name: '晨', hour: 6.4, turbidity: 3.0, rayleigh: 2.9, mie: 0.010, mieG: 0.86,
    sun: 0xffd2a1, sunI: 2.6, hemiSky: 0x9fbcd8, hemiGround: 0x6b5c46, hemiI: .75,
    fog: 0xd9c3a4, fogNear: 65, fogFar: 430, exposure: .96, dim: .92, label: '晨' },
  day:  { name: '昼', hour: 12,  turbidity: 2.4, rayleigh: 1.1, mie: 0.005, mieG: 0.80,
    sun: 0xfff2dc, sunI: 3.1, hemiSky: 0xbcd6ef, hemiGround: 0x6f6350, hemiI: .85,
    fog: 0xc6d6e2, fogNear: 95, fogFar: 560, exposure: .90, dim: 1.0, label: '昼' },
  dusk: { name: '昏', hour: 17.7, turbidity: 4.2, rayleigh: 3.4, mie: 0.014, mieG: 0.88,
    sun: 0xff9a55, sunI: 1.65, hemiSky: 0x9a9ad0, hemiGround: 0x5c4636, hemiI: .95,
    fog: 0xcfa989, fogNear: 65, fogFar: 460, exposure: 0.98, dim: .55, label: '昏' },
  night:{ name: '夜', hour: 21,  turbidity: 2.0, rayleigh: 0.4, mie: 0.002, mieG: 0.78,
    sun: 0x93b4e0, sunI: 0.60, hemiSky: 0x415a80, hemiGround: 0x1e232b, hemiI: .66,
    fog: 0x1c2a3c, fogNear: 45, fogFar: 330, exposure: 1.14, dim: .22, label: '夜' },
};

/* 时段顺序（滑杆 0~24 对应哪些预设） */
const ORDER = ['dawn', 'day', 'dusk', 'night'];

export function initSky(renderer, scene) {
  /* ── 天穹 ── */
  const sky = new Sky();
  sky.scale.setScalar(900);   /* 相机 far 之内，否则天穹被远裁剪面切掉 */
  sky.name = 'jn-sky';
  scene.add(sky);

  /* three 的 Sky 是 Preetham 模型，**没有夜间支持**：
     太阳落到地平线以下时它不会变黑，反而会把地平线附近烧成一片亮白
     （公式里 1/(1-Fex) 会放大），于是 21 点看着像阴天。
     这里不改官方文件，用 onBeforeCompile 给天穹末尾挂一个压暗系数。 */
  function attachDim(mat) {
    const dim = { value: 1 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNightDim = dim;
      sh.fragmentShader = 'uniform float uNightDim;\n' + sh.fragmentShader
        .replace('gl_FragColor = vec4( retColor, 1.0 );',
                 'gl_FragColor = vec4( retColor * uNightDim, 1.0 );');
    };
    mat.needsUpdate = true;
    return dim;
  }
  const skyDim = attachDim(sky.material);

  const u = sky.material.uniforms;
  u.turbidity.value = 2.4;
  u.rayleigh.value = 1.1;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.80;

  /* ── 光 ── */
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  const S = 130;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd6ef, 0x6f6350, .85);
  scene.add(hemi);

  /* ── 环境贴图 ── */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(900);
  const envDim = attachDim(envSky.material);
  envScene.add(envSky);
  let envRT = null;

  /* ── 雾 ── */
  scene.fog = new THREE.Fog(0xc6d6e2, 90, 420);

  const state = {
    hour: 12, phase: 'day', label: '昼',
    sun, hemi, sky,
    onChange: null,          /* 外部（UI）可挂回调，时辰变化时收到新值 */
  };

  /* 真实太阳：夜里高度角为负（太阳确实在地平线下）。
     白天沿用原来的日出日落曲线。 */
  function realSunVec(hour) {
    const t = (hour - 6) / 12;
    const azi = THREE.MathUtils.lerp(-Math.PI * .58, Math.PI * .58, THREE.MathUtils.clamp(t, -0.25, 1.25));
    let alt;
    if (hour >= 5 && hour <= 19) {
      alt = Math.sin(Math.PI * THREE.MathUtils.clamp((hour - 5) / 14, 0, 1)) * (72 * Math.PI / 180);
    } else {
      /* 夜里太阳沉到地平线下 12°~48° */
      const nh = hour < 5 ? (hour + 24 - 19) / 10 : (hour - 19) / 10;
      alt = -(0.21 + 0.62 * Math.sin(Math.PI * THREE.MathUtils.clamp(nh, 0, 1)));
    }
    const phi = Math.PI / 2 - alt;
    return new THREE.Vector3().setFromSphericalCoords(1, phi, azi);
  }

  /* 月亮方向（西北高位）：夜里平行光改用它，
     否则平行光被钳在地平线附近，会把每面白墙照得雪亮。 */
  const MOON_DIR = new THREE.Vector3(-0.42, 0.72, -0.55).normalize();

  /* 太阳位置：方位角随时间从东往西走，高度角按 sin 曲线（6~18 点日出日落） */
  function sunVec(hour) {
    const t = (hour - 6) / 12;                 /* 0 = 日出, 1 = 日落 */
    const azi = THREE.MathUtils.lerp(-Math.PI * .58, Math.PI * .58, THREE.MathUtils.clamp(t, -0.25, 1.25));
    /* 高度角：日出日落为 0，正午最高 ~72°；夜间按月光压低 */
    let alt;
    if (hour >= 5 && hour <= 19) {
      alt = Math.sin(Math.PI * THREE.MathUtils.clamp((hour - 5) / 14, 0, 1)) * (72 * Math.PI / 180);
    } else {
      /* 夜间：月亮挂在天上，按同一个曲线的反相延伸 */
      const nh = hour < 5 ? (hour + 24 - 19) / 10 : (hour - 19) / 10;
      alt = Math.sin(Math.PI * THREE.MathUtils.clamp(nh, 0, 1)) * (46 * Math.PI / 180) + .12;
    }
    const phi = Math.PI / 2 - alt;
    return new THREE.Vector3().setFromSphericalCoords(1, phi, azi);
  }

  /* 最近的那个时段预设 */
  function nearestPhase(hour) {
    let best = ORDER[0], bd = 99;
    for (const k of ORDER) {
      const d = Math.abs(PHASES[k].hour - hour);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  /* 把参数按当前小时在相邻两个预设之间插值 —— 拖滑杆时天色是连续变的 */
  function blended(hour) {
    const k = nearestPhase(hour);
    const p = PHASES[k];
    const nextK = ORDER[(ORDER.indexOf(k) + 1) % ORDER.length];
    const q = PHASES[nextK];
    /* 以预设为中心，前后各 1.4 小时做线性过渡 */
    const span = 1.4;
    let t = 0;
    const dh = hour - p.hour;
    if (dh > span) t = Math.min(1, (dh - span) / (span * 2));
    else if (dh < -span) t = Math.max(0, 1 + (dh + span) / (span * 2));
    const L = (a, b) => a + (b - a) * t;
    const C = (ca, cb) => new THREE.Color(ca).lerp(new THREE.Color(cb), t);
    return {
      turbidity: L(p.turbidity, q.turbidity),
      rayleigh: L(p.rayleigh, q.rayleigh),
      mie: L(p.mie, q.mie),
      mieG: L(p.mieG, q.mieG),
      sun: C(p.sun, q.sun),
      sunI: L(p.sunI, q.sunI),
      hemiSky: C(p.hemiSky, q.hemiSky),
      hemiGround: C(p.hemiGround, q.hemiGround),
      hemiI: L(p.hemiI, q.hemiI),
      fog: C(p.fog, q.fog),
      fogNear: L(p.fogNear, q.fogNear),
      fogFar: L(p.fogFar, q.fogFar),
      exposure: L(p.exposure, q.exposure),
      dim: L(p.dim, q.dim),
    };
  }

  /* 环境贴图重烘（PMREM 比较贵，节流） */
  let envDirty = true, envTimer = 0;
  function bakeEnv() {
    const eu = envSky.material.uniforms;
    eu.turbidity.value = u.turbidity.value;
    eu.rayleigh.value = u.rayleigh.value;
    eu.mieCoefficient.value = u.mieCoefficient.value;
    eu.mieDirectionalG.value = u.mieDirectionalG.value;
    eu.sunPosition.value.copy(u.sunPosition.value);
    const old = envRT;
    envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    if (old) old.dispose();
  }

  function apply(hour, force) {
    hour = THREE.MathUtils.clamp(hour, 0, 24);
    state.hour = hour;
    const k = nearestPhase(hour);
    state.phase = k;
    state.label = PHASES[k].label;
    const b = blended(hour);

    u.turbidity.value = b.turbidity;
    u.rayleigh.value = b.rayleigh;
    u.mieCoefficient.value = b.mie;
    u.mieDirectionalG.value = b.mieG;
    /* Preetham 用真实太阳：夜里它在地平线下，天穹自然失去直射光
       （再配合 dim 系数把残余亮度压掉） */
    const d = realSunVec(hour);
    u.sunPosition.value.copy(d);

    sun.color.copy(b.sun);
    sun.intensity = b.sunI;
    if (d.y > .02) {
      sun.position.set(d.x * 200, Math.max(8, d.y * 200), d.z * 200);
    } else {
      /* 夜里改用月光方向（西北高位），强度也小 —— 夜里靠窗灯和月色 */
      sun.position.copy(MOON_DIR).multiplyScalar(220);
    }
    sun.target.position.set(0, 0, 0);

    hemi.color.copy(b.hemiSky);
    hemi.groundColor.copy(b.hemiGround);
    hemi.intensity = b.hemiI;

    scene.fog.color.copy(b.fog);
    scene.fog.near = b.fogNear;
    scene.fog.far = b.fogFar;
    scene.background = null;         /* 天穹自己当背景 */

    renderer.toneMappingExposure = b.exposure;
    skyDim.value = b.dim;
    envDim.value = b.dim;

    envDirty = true;
    if (force) { bakeEnv(); envDirty = false; }
    if (state.onChange) state.onChange(state.hour, state.label, k);
  }

  state.setHour = (h, force) => apply(h, force);
  state.update = (dt) => {
    if (!envDirty) return;
    envTimer += dt;
    if (envTimer > .18) { envTimer = 0; bakeEnv(); envDirty = false; }
  };
  /* 供 UI 用：当前小时 → 阶段名 */
  state.labelOf = (h) => nearestPhase(h);

  apply(12, true);
  return state;
}
