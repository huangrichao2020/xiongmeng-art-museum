# 熊萌圣诞冰雪艺术馆 3D 世界 · 项目交接手册 (HANDOFF)

> 最后更新：2026-11-23  
> 线上地址：https://preview.ai10088.com/alex-garage/  
> 仓库主文件：`xiongmeng-art-museum.html`

---

## 1. 项目概览与目录结构

本项目为单 HTML 模块化 Three.js 场景（Three.js `0.168.0`，ESM importmap 引入），开发与维护均集中在主文件，构建时仅将 CDN importmap 替换为部署目录下的相对路径 `./three.module.js` 与 `./addons/`。

| 文件 / 目录 | 说明 | 是否纳入 Git |
| :--- | :--- | :--- |
| `xiongmeng-art-museum.html` | 唯一核心源码（HTML + CSS + Three.js 逻辑） | ✅ 是 |
| `assets2d/` | 2D 美术与海报贴图资源 | ✅ 是 |
| `README.md` / `HANDOFF.md` | 项目说明与交接手册 | ✅ 是 |
| `.deploy/` / `.localtest/` | 本地构建产物（已替换 importmap 为本地路径） | ❌ 忽略 |
| `*.bak-*` | 历史手工备份文件 | ❌ 忽略 |

---

## 2. 空间坐标系与全图分区布局

所有地面坐标以艺术馆前中心为原点 `(0, 0, 0)`，`+Z` 朝南（游乐园方向），`-Z` 朝北（北街小店方向），`-X` 朝西，`+X` 朝东。

### 2.1 核心内环（主环路 `LOOP` 内外）
- **闭合环城圣诞大道 (`LOOP`)**：中心线 `x ∈ [-54, 54]`，`z ∈ [-21, 15]`，路面半宽 `4.45m`（外沿 `x = ±58.45, z = -25.45 / +19.45`）。
- **熊萌艺术馆 (`shop` / `shop2`)**：`x ∈ [-9.7, 12.2]`，`z ∈ [-11.7, 7.8]`。
  - 正门在 `(0, 0, 7.5)`，两扇玻璃门向内敞开 `76°`，一楼正门通道 (`|x| < 1.85, z ∈ [7.20, 9.35]`) 畅通可走入；
  - 含 1F 展厅/咖啡区、钢梯、2F 雕塑与 POP MART 展墙、屋顶星空露台。
- **西侧喷泉花园 (`westGarden`)**：喷泉中心 `(-24.4, 0.2)`；西侧扩展圣诞巨树与驯鹿打卡广场中心 `(-41.8, 0.2)`（圆形雪台半径 `5.6m`）。
- **东侧动漫雪园 (`animePark`)**：中心 `(26.5, -2.0)`，占地 `28m × 22m`。
- **街边小店 (`SHOPS`)**：
  - 北段 6 间：`z = -30.1`（已退让出北环路 `z=-25.45` 并留出北铁轨安全距离）
  - 西段 4 间：`x = -63.1`（正面朝东）
  - 东段 4 间：`x = +63.1`（正面朝西）

### 2.2 外环观光小火车 (`TRAIN_CURVE`)
- 铁轨矩形环绕主园区与游乐园：`x = ±69.5`，`z = -35.0 ~ +64.0`。
- **3 座车站 (`TRAIN_STATIONS`)**：
  1. `东街雪原站` `(69.5, -2.0)`
  2. `游乐园南站` `(4.0, 64.0)`
  3. `西街市集站` `(-69.5, -2.0)`

### 2.3 圣诞游乐园及东西双地标
- **游乐园主体 (`fair`)**：围栏范围 `x ∈ [-31.7, 43.7]`，`z ∈ [19.3, 56.7]`，北门净宽 `x ∈ [0.5, 7.5]`。
  - **游客留言信箱亭 (`gb`)**：`(4.0, 0, 24.5)`（`2.0m × 1.25m` 底座，含邮筒与留言板弹窗）
  - **巨型圣诞树**：`(-15.5, 0, 25.5)`
  - **小吃一条街（6 摊）**：`x = 13..37, z = 22`
  - **旋转木马 / 海盗船 / 高空飞索 / 冰面碰碰车 (`(7, 45)`) / 充气城堡 (`(-14, 51)`)**
  - **敞篷双轮观景摩天轮**：`(27, 0, 36)`，轮径 `21m`
  - **圣诞高空弹射跳伞塔 (`SKY LAUNCH`)**：`(29.5, 0, 44.5)`，整体放大 `1.42x`，高 `~17.5m`
  - **巨型圣诞老人雕塑**：`(32, 0, 52)`，双层大理石鎏金底座，总高 `~5.8m`
- **游乐园左侧 · 象牙白哥特婚礼大教堂 (`(-49, 0, 36)`)**：
  - 参照科隆大教堂双塔（高 `~23.8m`）× 巴黎圣母院中央细尖塔 `Flèche` + 外骨骼飞扶壁群 + 三重尖拱门。
  - 中央大门向内敞开 `78°`，第一人称可通过红毯通道 (`x ∈ [-50.0, -48.0], z ∈ [26.0, 39.8]`) 步入观礼。
  - 内部为正在举办的**小熊人圣诞婚礼**：集束柱廊、交叉尖拱肋穹顶、水晶吊灯、圣坛与管风琴、繁花拱门、小熊神父、小熊新郎新娘、伴郎伴娘、小花童及 `16` 位小熊观礼宾客。
- **游乐园右侧 · 百老汇圣诞大剧院 (`(55.5, 0, 36)`)**：
  - 6 根缠绕圣诞灯藤的大理石圆柱门廊、百老汇跑马灯门头 `圣诞大剧院 · GRAND THEATRE`、金色肋骨玻璃大穹顶与后部舞台塔楼。
- **空中动态对象**：
  - 圣诞老人三驯鹿飞天雪橇 (`flyingSleigh`，点击可坐上礼物堆视角俯瞰)
  - 3 架圣诞巡逻直升机 (`helis`，高 `21.5~25m`，带探照灯光锥，可点击搭乘)
  - 游乐园上空密集烟花秀 (`fwSys`, `MAX = 1800`)

### 2.4 外围城市路网、建筑群与轻量化车流人流
- **四向城市路网 (`skyline`)**：北外环 `z = -46`、南外环 `z = 75`、西外环 `x = -80`、东外环 `x = 80`，以及第二环干道（`x = ±124, z = -84 / -124 / 114`），并配有 3 座火车站平交连接道、斑马线与路灯。
- **外围城市建筑群**：
  - 近中圈 `cityLayout`：带立体壁柱、店招灯箱、雨篷、小阳台与坡屋顶；
  - 远圈至地平线边缘（`±178m`）：`addFarTower` 按高低错落比例分布（55% `9~19m`、30% `22~34m`、15% `38~52m`），全量通过 `mergeStatic(skyline)` 静态合批。
- **外侧极速车流与人流 (`outerCrowd`)**：
  - `72` 辆巡航车（`4` 个 `InstancedMesh`）运行在内外两圈外环大道 4 条车道；
  - `240` 位小熊行人（`3` 个 `InstancedMesh`）分布于 14 条外环人行道上往返漫步。

---

## 3. 交互控制与后端服务

### 3.1 键盘与鼠标交互
- **沙盘模式**：鼠标左键旋转、滚轮缩放、右键平移，`WASD` / 方向键水平移动。
- **第一人称模式 (`fp.on`)**：`WASD` 行走、`Shift` 加速、按住左/右键拖动转头、`Q` 退出第一人称；走近小火车/摩天轮按 `E` 上下车。
- **高空弹射跳伞 (`launchSys`)**：点击 `(29.5, 44.5)` 弹射塔即刻上座 -> `0.65s` 蓄力震动 -> 弹射升至 `~51m` 高空 -> 顶点自动开红白圣诞降落伞 -> **`WASD` / 方向键实时控制滑翔方向**（`Shift` 加速俯冲）-> 触地自动收伞切换为步行。
- **盲盒礼物山**：位于 `(-6.5, 0, 23.5)`，点击拆盲盒，解锁礼物可摆入艺术馆展出（`localStorage` 持久化）。

### 3.2 留言信箱后端接口
- 前端接口路径：`/alex-garage/api/guestbook`（同源反代）。
- 阿里云后端进程：`127.0.0.1:18791`（`systemd` 托管 Python/SQLite 服务），支持留言 CRUD、30 字上限、匿名投递及管理删除密码 `1225`。

---

## 4. 渲染画质与性能优化架构

为保证全城 180+ 建筑、72 辆外围车、240 外围行人及百余园内 NPC 同步流畅运行，当前已落地以下关键优化：

1. **像素填充与后处理平衡**
   - `HI_DPR = Math.min(devicePixelRatio || 1, 1.15)`，`EffectComposer` 配合 `UnrealBloomPass`（`0.25x` 采样分辨率，`radius: 0.82`）与 `ACESFilmicToneMapping`（曝光 `1.12`）。
   - `ctex()` 全局启用 `anisotropy = 8`。
2. **动态阴影节流与光源严控**
   - 主平行光 `key.shadow.mapSize` 为 `1024×1024`（`PCFSoftShadowMap`），设置 `renderer.shadowMap.autoUpdate = false`，在 `animate()` 中每 `6` 帧触发一次 `needsUpdate = true`。
   - 严控全场 `PointLight` 数量：北街小店循环灯、动漫园分灯、教堂/剧院多余辅灯、外围树灯及 `skylineMats` 的 `bumpMap` 均已合并或移除，改用发光自发光材质与地面贴片光晕（`AdditiveBlending`）。
3. **静态合批与 CPU 分帧避让**
   - `skyline`、`lmGroup`（教堂+剧院+雪堆）、`fair`、`shopRow` 均调用 `mergeStatic()` 合批（动态物体通过 `userData.keep = true` 跳过）。
   - 园内 `npcs` 同伴碰撞分离与 `OUTDOOR_OBS` 障碍物避让均采用**距离平方粗剔除 + 分帧取模节流**，避免 `O(N²)` 平方根运算堵塞主线程。
4. **空气透视系统 (`aerialHaze`)**
   - 随 `camera.position.y` 动态调节 `FogExp2` 密度，配合低空 `12` 层空气透视薄雾带（前景 `<16m` 自动透明不糊眼）和前景随行补光，实现前中后景分明的大气层次。

---

## 5. 构建、校验与部署流水线

### 5.1 构建本地产物 & 语法校验
发布前需将 CDN importmap 替换为同目录本地依赖，并提取 `<script type="module">` 进行 Node 语法校验：

```bash
W=/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace
cd "$W" && python3 - <<'EOF'
import re
src = open('xiongmeng-art-museum.html', encoding='utf-8').read()
old = '''    "three": "https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/"'''
new = '''    "three": "./three.module.js",
    "three/addons/": "./addons/"'''
assert old in src, "importmap not found!"
out = src.replace(old, new)
open('.deploy/index.html', 'w', encoding='utf-8').write(out)
open('.localtest/index.html', 'w', encoding='utf-8').write(out)
m = re.search(r'<script type="module">(.*?)</script>', out, re.S)
open('/tmp/dep.mjs', 'w', encoding='utf-8').write(m.group(1))
EOF
node --check /tmp/dep.mjs && echo "SYNTAX OK"
```

### 5.2 上传部署至阿里云 (`aliyun`) 并验证
```bash
LOCAL_MD5=$(md5 -q .deploy/index.html) && echo "LOCAL_MD5=$LOCAL_MD5" && \
scp .deploy/index.html aliyun:/www/wwwroot/jiaojia-preview/alex-garage/index.html && \
ssh aliyun "chown www:www /www/wwwroot/jiaojia-preview/alex-garage/index.html && md5sum /www/wwwroot/jiaojia-preview/alex-garage/index.html" && \
curl -s -o /dev/null -w 'PUBLIC HTTP %{http_code}\n' https://preview.ai10088.com/alex-garage/
```
*(部署确认标准：远端 `md5sum` 与 `LOCAL_MD5` 完全一致，且公网 HTTP 返回 `200`。)*
