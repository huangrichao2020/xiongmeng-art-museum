# 云霄飞车「从高位下来时画面卡顿」— 排查记录

> 记录时间：2026-11-23
> 排查人：MCode（接手自 agy，agy 因额度耗尽中断）
> 当前线上版本：`225d1dbf6224f34738884d034c08b5a5`（agy 的版本，本轮改动已回滚）
> 状态：**未修复**。本文件只记录排查结论，不含已应用的修改。

---

## 1. 原始问题

用户原话（agy 会话截图里）：

> 云霄飞车 每次高处向下的时候就卡了

即：乘云霄飞车时，**车辆从高处往低处俯冲的阶段**画面卡顿；上下平缓段正常。

---

## 2. 我做了什么测量

在本地副本 `.localtest/` 上给场景注入探针，逐帧采集：

| 采集项 | 方法 |
| :--- | :--- |
| 帧时间 `dt` | `clock.getDelta()` |
| draw call / 三角面 | `renderer.info.render.*`（**必须在 `composer.render()` 之后读**，之前读会得到 0，因为 `EffectComposer` 会重置 info） |
| 相机高度 | `camera.position.y` |
| 烟花粒子数 / 死亡数 / splice 耗时 | 在 `fwSys` 内部加计数器 |
| 分段 CPU 耗时 | 在 `animate()` 里给 NPC 段 / 飞车段 / 外围人群段 / 烟花段 / render 段分别打 `performance.now()` 计时 |

按高度分段统计（乘车状态，4.2 秒采样窗口）：

| 高度段 | 帧数 | draw calls | 三角面 | 帧时间均值 | 峰值 |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 13–16m（山顶） | 154 | 187 | ~27 万 | 10.0ms | 15.5ms |
| 10–13m | 106 | 157 | ~27 万 | 10.0ms | 13.4ms |
| 7–10m | 83 | 169 | ~27 万 | 10.0ms | 22.7ms |
| 4–7m | 73 | 185 | ~27 万 | 10.0ms | 11.1ms |
| **1–4m（俯冲底）** | 26 | **296** | **~30 万** | **13.4ms** | **29.6ms** |

分段 CPU 耗时（每帧）：

```
NPC 0.38~0.59ms │ 飞车 0.01~0.02ms │ 外围人群 0.01~0.03ms │ 烟花 0.08~0.10ms │ render 4.26~5.16ms
```

---

## 3. 结论：CPU 侧已彻底排除

**所有 JS 逻辑加起来不到 1ms/帧。** 瓶颈只可能在 `composer.render()` 之后的 GPU 填充/光栅化。

下坡 vs 山顶的确定差异：

1. **draw calls 296 vs 187（+58%）**，三角面 30 万 vs 27 万 —— 俯冲时视锥内几何确实更多。
2. **下坡速度是山顶的 2.9 倍**：`spd = max(.028, .058 + (7.0 - y) * .0048)`
   - y=13.4（山顶）→ 0.028（被下限夹住）
   - y=2（俯冲底）→ 0.082
   → 相机移动最快，frustum culling 每帧重算量最大。
3. **视距裁剪面 700m 是纯浪费**：`FogExp2(0.0082)` 在 200m 处雾浓度已 93%，260m 外的几何体**一个像素都看不见却被绘制**。

---

## 4. 已排除的假设（别再走一遍）

| 假设 | 实测结果 | 结论 |
| :--- | :--- | :--- |
| 烟花 `sparks.splice()` 是 O(N²) 瓶颈 | 123 次 burst 累计仅 6.3ms；splice 耗时 0.1ms/帧 | ❌ 排除 |
| 烟花 `shift()` 搬移开销大 | 5 秒内 1513 次 shift，实测无对应卡顿 | ❌ 排除 |
| Bloom（UnrealBloomPass）填充率是瓶颈 | 关闭后 dt 21.4ms vs 开启 18.8ms（无差异，噪声） | ❌ 排除 |
| 缩短 `camera.far` 能减 draw call | far 700→1136 / 260→1019 / 180→1136 / 120→1244 | ⚠️ **260 最优（-10%），但整体无效** |
| 视距裁剪对合批几何无效 | 缩短 far 到 180 反而涨回 1136 | ✅ **确认**：合批后的大 mesh 包围球巨大，frustum culling 拦不住，只能整块画 |
| 1F 细碎展品是主要来源 | 强制隐藏 shop1 后 dt 峰值 20.5→13.4ms，但 draw call 反涨（202→224） | ⚠️ 差异疑似噪声，未确证 |
| fog 密度随高度变化触发 shader 重编译 | `scene.fog.density` 连续赋值，不涉及 `material.needsUpdate` | ❌ 排除 |

---

## 5. 测量环境的严重局限（这是本次排查最大的坑）

**本机 Chrome 长期被 Code 进程抢占 CPU**，基线 `dt` 就有 10ms 级波动和 27~31ms 尖峰。

后果：
- 同一份代码、不同时间采样，`dt` 均值在 10.0~13.4ms 之间跳；
- A/B 对比中「关掉 1F 后峰值 20.5→13.4ms」看着像改善，但同一组里 draw call 反而上升，**大概率是噪声而非真实收益**；
- 高度分段的 calls/tris 趋势可信（几何量差异是确定的），**帧时间数据不可信**。

**结论：用户真机上看到的卡顿，在这台机器上复现不出来。** 任何基于本机 FPS 读数的"优化"都是赌博。

---

## 6. 代码里确定存在的三个结构性问题（尚未修）

### 6.1 `hide1F` 阈值穿越 —— 下坡时 1F 整体重新进场

```js
// 现状（agy 版，约 10576 行）
const hide1F = camera.position.y > 9.5 && !inBuildingXZ(camera.position.x, camera.position.z);
shop1.visible = !hide1F;
```

只在 **y > 9.5m** 时隐藏 1F 室内细碎展品。**下坡穿过 9.5m 的瞬间，`shop1.visible` 翻回 true**，
1F 全部展品重新进入渲染列表 —— 正好发生在最卡的俯冲段。

### 6.2 远裁剪面 700m 与雾浓度严重不匹配

雾在 200m 外已 93% 遮蔽，但相机仍绘制到 700m。实测 far=260 时 draw call 从 1136 降到 1019（-10%），画面无可见差异（远处城市群在 260m 外本就被雾吃掉，实测截图确认没有"凭空消失"）。

### 6.3 骑乘时自适应 DPR 控制器被整体禁用

```js
// 现状（agy 版，约 10598 行）
if(!ridingFast){
  if(f<44){ ...降级... } else if(f>=54){ ...升级... }
}
```

**骑乘期间整块跳过** → 掉帧时没有任何自动降级救援。agy 在 `9efd026` 里加这条时，是为了避免"高速段乱跳分辨率"，但代价是高速段彻底失去自救能力。

---

## 7. 我试过但已回滚的改动（本轮未保留）

以下 4 条曾改入并部署（`0caf09c6`），**用户要求停止改动后已全部回滚**，
线上与本地源文件均回到 agy 的 `225d1dbf`。记录在此供后续参考：

1. `const RIDE_FAR=260;` —— 乘云霄飞车时 `camera.far` 700→260，下车恢复 700。
2. `const RIDE_DPR=Math.min(LO_DPR,.85);` —— 乘云霄飞车时 pixelRatio 1→0.85（像素数 -28%），下车恢复。
3. `hide1F` 条件改为 `(camera.position.y>9.5 && !inBuildingXZ(...)) || ridingFast` —— 骑乘期间始终隐藏 1F。
4. 自适应 DPR 控制器去掉 `if(!ridingFast)` 外层限制，骑乘时降级上限锁 `RIDE_DPR`。
5. HUD 扩展：`fpsEl.textContent` 追加 `calls` 与 `k tri` 显示（便于真机定位）。

回滚原因不是这些改动有错，而是**在无法确证收益的情况下不该改**（本机测不出真实卡顿）。

---

## 8. 下一步建议（按性价比排序）

### 8.1 先解决"测不准"这件事（最重要）

本机读数不可信，必须让用户在自己机器上看数据。

- **加一个常驻性能 HUD**：FPS + draw calls + 三角面 + 相机高度（改动 #5 就是干这个的，很小）
- 让用户乘云霄飞车跑两圈，**把下坡那几秒的 HUD 数值截图发回来**
- 有这组数就能直接定位是几何量爆了还是填充率爆了

### 8.2 若确认是几何量（calls 偏高）

- 骑乘时 `camera.far` 收到 260（改动 #1，已验证无视觉差异）
- 骑乘时始终隐藏 1F（改动 #3）
- 治本方案：**把大合批拆成区域合批**，让 frustum culling 重新生效。
  这是根治手段 —— 现在 `skyline` / `lmGroup`（教堂+剧院）/ `fair` 各自合成一个巨大 mesh，
  包围球覆盖半个园区，只要碰到视锥就全画。
  **风险高**（会破坏 `mergeStatic` 依赖的层级与动画），要动必须先读懂 `mergeStatic` 的 `skip`/`userData.keep` 机制。

### 8.3 若确认是填充率（calls 正常但帧时间高）

- 骑乘时降 pixelRatio（改动 #2）
- 骑乘时关掉 Bloom（但本机实测无收益，需真机再验）
- 骑乘时把 MSAA 关掉（`_msaaSamples` 目前是 2x，改动会更大，先别动）

### 8.4 无条件该修的

- **改动 #3**（hide1F 阈值穿越）：这是逻辑缺陷，不是调优 —— 下坡时 1F 白白进场。
- **改动 #5**（HUD）：观测工具，越早加越好。
- **改动 #4**（骑乘时恢复自适应降级）：恢复自救能力。

---

## 9. 遗留问题（与飞车无关，顺手记一下）

1. **服务器上 `xm_toon_girl.png` 是孤儿资源**（281KB）。
   agy 在 `72a8a96` 之前把整套 2D 角色系统删了，代码里已无任何引用，但文件还留在服务器上。
   - 用户此前明确要求：「ip 立绘 就这个最精美的贴到游乐园大门上，不要悬浮空中，只保留这个立绘，其余全删」
   - 当前状态：**这张最精美立绘既没被用上，也没被彻底清理**，属于半吊子状态，需确认用户最终要哪种。
2. 用户此前那批指令的执行情况（agy 已完成大部分）：
   - ✅ 游乐园大门口配饰全删（锦毯 / 迎宾柱 / 雪堆小雪松 / 气球串 / 糖果拐杖）
   - ✅ 其余 2D 立牌与贴花全删
   - ✅ 碰碰车区域扩大一倍（16×12m → **24×16m**，中心 (7,45)）
   - ❓ 地面雕塑是否已全部挪进游乐园 —— **未核实**
   - ❓ 游乐园门口马路是否完全空出 —— **未核实**
   - ❌ 最精美 IP 立绘未接回大门

---

## 10. 复现与测量速查

```bash
W="/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace"

# 1) 构建本地测试副本（相对路径 importmap）
cd "$W" && python3 - <<'EOF'
import re
src = open('xiongmeng-art-museum.html', encoding='utf-8').read()
old = '''    "three": "https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/"'''
new = '''    "three": "./three.module.js",
    "three/addons/": "./addons/"'''
assert old in src
open('.localtest/index.html','w',encoding='utf-8').write(src.replace(old,new))
m = re.search(r'<script type="module">(.*?)</script>', src, re.S)
open('/tmp/dep.mjs','w',encoding='utf-8').write(m.group(1))
EOF
node --check /tmp/dep.mjs

# 2) 拉依赖
cd "$W/.localtest" && D=/www/wwwroot/jiaojia-preview/alex-garage
ssh -o BatchMode=yes aliyun "cd $D && tar czf - three.module.js addons xm_couple.jpg xm_portrait.jpg audio models icons" | tar xzf -

# 3) 起服务
cd "$W/.localtest" && (nohup python3 -m http.server 8765 --bind 127.0.0.1 >/tmp/http8765.log 2>&1 &)
# 浏览器打开 http://127.0.0.1:8765/index.html
```

**注意**：本机 `cwd` 与绝对路径访问偶发失败，报 `No such file or directory` 时重跑一次即可，文件没丢。

---

## 11. 关键代码位置（用 grep 定位，勿依赖行号）

| 内容 | 定位方式 |
| :--- | :--- |
| 云霄飞车曲线定义（CatmullRom，14 个控制点，双环闭合） | `grep -n "星夜极光风景云霄飞车"` |
| 飞车速度公式 `spd` | `grep -n "7.0-co._vP.y"` |
| 飞车动画与烟花齐射触发（`y>10.5`） | `grep -n "co._vP.y>10.5"` |
| 乘车相机跟随（`camera.up.copy(co._camU)`） | `grep -n "kind==='coaster'&&amusement.coaster"` |
| `hide1F` 逻辑 | `grep -n "hide1F"` |
| 自适应 DPR 控制器 | `grep -n "_lowFpsStreak"` |
| 相机创建（far=700） | `grep -n "new THREE.PerspectiveCamera(60"` |
| 烟花系统（`fwSys`，MAX=1800） | `grep -n "const fwSys"` |
| `mergeStatic` 合批工具 | `grep -n "function mergeStatic"` |
| `RIDE_EXITS` / `toggleRideFacility` / `stopFacilityRide` | `grep -n "function toggleRideFacility"` |
| 调试出口 `window.diorama` | `grep -n "window.diorama"` |

`window.diorama` 已暴露：`cam / fp / rain / setRain / refl / perf / hideRide / showRide / hide / show / shadows`，
可用来跳视角、测性能、开关分组。**但 `scene` / `renderer` / `composer` 未暴露** —— 需要时自行注入一行 `window.__scene=scene` 再测（上次就是这么做的）。
