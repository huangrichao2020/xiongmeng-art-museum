/* 江南古村 · 材质注入框架（src/core/patch.js）
   ------------------------------------------------------------------
   调研结论（GitHub Leonxlnx/golden-temple，MIT）：光有环境反射还不够，
   物件要"活"起来，靠两件事：
     ① 顶点风摆 —— 树、菜、竹随时间摇，风向缓慢转向；
     ② 逆光透光 —— 叶片在太阳背面透出光，树的层次立刻出来。

   这两样都不该靠重做贴图实现，而是用 onBeforeCompile 往 three 的
   标准材质着色器里注入几行 GLSL。

   做法照抄 golden-temple 的关键设计：**全局共享一份 uniforms 对象**，
   所有被 patch 的材质共用同一份 uTime / uWindDir / uSunDir，
   这样每帧只要更新一次，全场一起动，不用给每个材质单独传值。

   用法：
     import { patchWind, patchBacklight, sharedUniforms, updateShared } from '../core/patch.js';
     patchWind(MAT.leaf, { strength: .12 });
     patchBacklight(MAT.leaf, { color: 0x9ec46a, strength: .8 });
     // 每帧：
     updateShared(t, windDir, sunDirWorld);
*/
import * as THREE from 'three';

/* 全场共享的 uniforms（同一份对象引用） */
export const sharedUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(1, 0) },
  uWindStrength: { value: 1 },
  uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
  uBacklightColor: { value: new THREE.Color(0x9ec46a) },
  uBacklightStrength: { value: .8 },
};

const patched = new Set();

/* 风摆：顶点按离地高度摆动，越高摆得越多 */
export function patchWind(mat, opt = {}) {
  if (!mat || patched.has(mat)) return mat;
  patched.add(mat);
  const strength = opt.strength == null ? .1 : opt.strength;
  const freq = opt.freq == null ? 1.0 : opt.freq;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uWindDir = sharedUniforms.uWindDir;
    shader.uniforms.uWindStrength = sharedUniforms.uWindStrength;
    shader.uniforms.uWindAmp = { value: strength };
    shader.uniforms.uWindFreq = { value: freq };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec2 uWindDir;
        uniform float uWindStrength; uniform float uWindAmp; uniform float uWindFreq;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          /* 离地高度决定摆幅：根部不动，叶尖摇得最狠 */
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          float flex = clamp(wp.y * 0.55, 0.0, 3.0);
          float s1 = sin(uTime * 1.35 * uWindFreq + wp.x * 0.33 + wp.z * 0.21);
          float s2 = sin(uTime * 2.70 * uWindFreq + wp.x * 0.87 - wp.z * 0.61);
          float amp = uWindAmp * uWindStrength * flex;
          transformed.x += uWindDir.x * (s1 * 0.62 + s2 * 0.26) * amp;
          transformed.z += uWindDir.y * (s1 * 0.62 + s2 * 0.26) * amp;
          transformed.y -= abs(s1) * amp * 0.06;
        }`);
    mat.userData.shader = shader;
  };
  mat.needsUpdate = true;
  return mat;
}

/* 逆光透光：太阳在背面时，材质透出光 */
export function patchBacklight(mat, opt = {}) {
  if (!mat || mat.userData.__backlight) return mat;
  mat.userData.__backlight = true;
  const color = new THREE.Color(opt.color == null ? 0x9ec46a : opt.color);
  const strength = opt.strength == null ? .8 : opt.strength;
  const pow_ = opt.power == null ? 3.0 : opt.power;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uSunDirView = sharedUniforms.uSunDirView;
    shader.uniforms.uBacklightColor = sharedUniforms.uBacklightColor;
    shader.uniforms.uBacklightStrength = { value: strength };
    shader.uniforms.uBacklightPow = { value: pow_ };
    shader.uniforms.uBLColor = { value: color };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSunDirView; uniform vec3 uBLColor;
        uniform float uBacklightStrength; uniform float uBacklightPow;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          /* vViewPosition 是片元指向相机的向量；太阳在背面时点积为正 */
          vec3 vdir = normalize(vViewPosition);
          float bl = max(0.0, dot(vdir, uSunDirView));
          reflectedLight.indirectDiffuse += diffuseColor.rgb * uBLColor
            * pow(bl, uBacklightPow) * uBacklightStrength;
        }`);
    mat.userData.shader = shader;
  };
  mat.needsUpdate = true;
  return mat;
}

/* 每帧更新共享 uniforms */
const _v = new THREE.Vector3();
export function updateShared(t, windDir, sunDirWorld, camera) {
  sharedUniforms.uTime.value = t;
  if (windDir) sharedUniforms.uWindDir.value.set(windDir.x, windDir.z);
  if (sunDirWorld && camera) {
    /* 太阳方向变到相机空间 */
    _v.copy(sunDirWorld).transformDirection(camera.matrixWorldInverse);
    /* 透光要的是"光从背面来"的方向：视线与太阳相反时最亮 */
    sharedUniforms.uSunDirView.value.copy(_v).negate().normalize();
  }
}
