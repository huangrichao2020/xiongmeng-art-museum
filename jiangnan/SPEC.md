# 江南古村 · 工程契约（子任务必读）

新地图独立部署：`https://preview.ai10088.com/jiangnan/`
技术栈：three.js r168（沿用主站那套，importmap 相对路径 `./three.module.js` + `./addons/`），原生 ES Module，无构建工具、无 npm 依赖。

## 目录

```
jiangnan/
  index.html            页面骨架（主控负责，别改）
  src/
    main.js             入口：场景/相机/模式/重生成（主控负责）
    core/
      rng.js            种子随机数（已完成）
      layout.js         约束布局生成器（已完成）
      materials.js      共享调色板 + 程序化贴图（已完成）
      geo.js            通用几何工具（已完成）
    models/             ★ 每个模型一个文件 = 一个子任务
      terrain.js water.js roads.js houses.js farmland.js trees.js
      pagoda.js paifang.js props.js portal.js
    ui/
      panel.js minimap.js   （主控负责）
```

## 布局数据结构（`core/layout.js` 导出）

```js
export function generateLayout(seed, opts={}) → layout
```

`layout` 字段（**所有模型模块只读这个对象，不要自己造随机数**）：

| 字段 | 说明 |
|---|---|
| `layout.W, layout.H` | 网格宽高（格），当前 80×80 |
| `layout.cell` | 每格边长（米），当前 **3.2** |
| `layout.originX, layout.originZ` | 网格(0,0) 对应的世界坐标偏移 |
| `layout.type` | `Uint8Array(W*H)` 每格类型位掩码，见下 |
| `layout.cellType(x,z)` | 取某格类型 |
| `layout.houses[]` | `{x,z,rot,w,d,kind,style,door,floors}` 世界坐标；`w/d` = 占地格数（**当前恒为 2×2 格 = 6.4m×6.4m**）；`rot` = 绕 Y 弧度；`door` ∈ `N/S/E/W` 门朝的方向；`kind` ∈ `common/rich/granary/shrine`；`style` ∈ `0..3` 变体 |
| `layout.fields[]` | `{x,z,w,h,kind}` 世界坐标 + 占地格；`kind` ∈ `paddy/dry/tea/veg` |
| `layout.roads[]` | `{x1,z1,x2,z2,kind}` 世界坐标直线段；`kind` ∈ `main/stone/dirt` |
| `layout.rivers[]` | `{x1,z1,x2,z2,w}` 世界坐标直线段 + 宽度 |
| `layout.bridges[]` | `{x,z,rot,len,kind}` 桥（路跨水处） |
| `layout.trees[]` | `{x,z,type,scale,rot}`；`type` ∈ `pine/bamboo/willow/elm/gingko` |
| `layout.tower` | `{x,z}` 宝塔位置（只有一座） |
| `layout.paifangs[]` | `{x,z,rot,kind}` 牌坊 |
| `layout.props[]` | `{x,z,rot,kind}`；`kind` ∈ `well/dryingrack/waterwheel/boat/jar/lamp/pen/fence` |
| `layout.landmark` | `{name,sub,seed}` 标题（例：竹海茶山） |
| `layout.stats` | `{house,field,tree,paifang,tower,water,road,prop}` 计数 |

格类型位掩码（`layout.TYPE`）：
`WATER=1 ROAD=2 BRIDGE=4 FIELD=8 HOUSE=16 TOWER=32 PAIFANG=64 EMPTY=128`

世界坐标换算：`wx = originX + (gx+0.5)*cell`，`wz = originZ + (gz+0.5)*cell`（originX = -W*cell/2，**地图以原点为中心**）。
**坐标一律用 layout 里给的 x/z，不要自己乘 cell 再加偏移** —— 乘 cell 的格子中心是对的，格子左边界用 `originX + gx*cell`。

**村子只长在中心区**：`CORE = 16`，即格子 [16, W-16) × [16, H-16) 是村子（房屋/农田/干道），
外圈 16 格（≈51m）是林子与宝塔的地盘。

## 生成器已内建的硬约束（别改、也别在模型里重复实现）

1. **河与路正交**：河只走水平/垂直直线段，路只走水平/垂直直线段，交点必为直角。
2. **路近水锁直**：贴着水（1 格内）的路段不允许拐弯。
3. **房屋周围一圈禁止其他房屋**：任意两栋房屋的占地格（含各自外扩一圈）不得相交。
4. **房屋门朝道路**：每栋房 `rot` 已按最近道路方向算好，门朝路。
5. **农田必须近路/水/宅**：每块农田的占地格外扩一圈内必须有路/水/宅。
6. **宝塔距最近民居 ≥ 16 格**：生成器已保证 `tower` 到任一房屋格距离 ≥ 16。
7. **主路两端 85% 立牌坊**：主路两端各以 0.85 概率放牌坊。
8. **树在边缘、水边、树丛处加密**：生成器已算好每格树密度，采样后写进 `layout.trees`。

## 世界坐标与地面基准

- 地面基准 **y = 0**，所有建筑/树/道具都落在 y=0。
- 地形起伏只允许出现在**远离建筑区**的位置（边缘丘陵、河道岸坡），坡度要缓（≤ 0.35m / 8m）。
- 建筑区（房屋、农田、路的格子）地面保持水平，别把房子埋了或悬空。

## 随机性

- **不要用 `Math.random()`**（同 seed 必须生成同一张图）。
- 需要变化时用：`import { makeRng } from '../core/rng.js'; const r = makeRng(layout.seed ^ 0x1234);`
  同一模块内每个对象用固定次序消费 `r()`，保证可复现。

## 传送门

- `models/portal.js` 导出 `build(layout)` 与 `export const PORTALS = [{x,z,rot,target,label}]`。
- `target` 是另一个地图的完整 URL（主站 `https://preview.ai10088.com/alex-garage/`）。
- 法阵直径 3.6m，带光柱与涟漪；`main.js` 负责"走进触发跳转"。

## 模型模块契约（每个模型一个文件）

```js
import * as THREE from 'three';
import { layout, TYPE } from '../core/layout.js';   // 或用 build(layout) 形参
export function build(layout) { /* 返回 THREE.Group */ }
```

- **纯函数**：只吃 `layout`，不要读全局、不要自己 `Math.random()`。
- 返回一个 `THREE.Group`，`main.js` 负责 add 到场景。
- 必须 `group.name = 'model-xxx'`。
- 材质从 `core/materials.js` 取（`MAT.wall` / `MAT.tile` / `MAT.wood` / `MAT.stone` / `MAT.water` / `MAT.leaf` / `MAT.foliage` 等），**不要自己 new 一个灰白 MeshStandardMaterial 了事**。
- 几何细节要有层次：勒脚、墙帽、檐口、瓦垄、门窗框、栏杆。**纯色大方块＝不合格**（这是本项目反复踩过的坑）。
- 同一类构件用 `InstancedMesh` 或合批，控制 draw call（目标：全景机位 ≤ 400 draw call）。

## 质量线（用户原话：高质量、高精细度）

- 屋顶要有**瓦垄**（一片片瓦的起伏），不是一块斜面。
- 白墙要有**灰砖勒脚 + 墙帽**，墙面有轻微斑驳/水渍。
- 马头墙要做出**阶梯状山墙**轮廓。
- 木构（梁柱栏杆）要有**色差**，不要一种木头色。
- 树要有**分层树冠**（3~4 层）+ 树干分叉感。
- 夜里要有暖光点缀（灯笼、窗光、水面反光），但**光点数量要克制**（点光源 ≤ 8 盏，其余靠自发光材质）。
- 所有构件的**底部要落地**，不许悬空、不许穿模。

## 验收

- 改完跑：`node --check` 不适用（ESM），改用 `cp src/models/xxx.js /tmp/x.mjs && node --check /tmp/x.mjs`。
- 不要部署、不要改 `index.html` / `main.js` / `core/*`（要改就在自己的文件里做，或在交付说明里写清需要什么）。
- 交付说明里写：文件路径、生成的对象数、draw call 估计、你做的关键细节清单。
