# XM Studio · AI 取景录制接口

给 AI 用的极简 HTTP 服务。一次调用就出一段成片素材，不用人工在页面里找位置、按键、掐时间。

## 启动

```bash
cd tools/xm-studio
node server.js          # 或 ./start.sh
```

服务监听 `http://127.0.0.1:8789`，产物写到 `~/Desktop/xm-shots/`。
服务自带无头 Chromium（真实 GPU 渲染，ANGLE/Metal），不要求你先把页面打开。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 服务状态、站点地址、产物目录 |
| GET | `/shots` | 列出全部机位（id / 中文名 / 类型 / 描述） |
| POST | `/shot` | `{"id":"coaster-chase"}` 切机位，不录 |
| POST | `/record` | `{"shot":"coaster-chase","duration":8,"fps":30,"saturation":1.3}` 录制并落盘 |

`/record` 返回：

```json
{ "ok": true,
  "raw":  "/Users/.../Desktop/xm-shots/coaster-chase_1795498802.webm",
  "file": "/Users/.../Desktop/xm-shots/coaster-chase_1795498802.mp4",
  "size": 5459268, "mp4Size": 6102312, "mime": "video/webm;codecs=vp9",
  "shot": "coaster-chase", "duration": 8, "fps": 30,
  "saturation": 1.3, "outFps": 30 }
```

- `raw` 是原始 webm（vp9，逐帧捕获的原始素材，无损保留）
- `file` 是转好的 mp4（H.264 / yuv420p / CFR 恒定帧率 / faststart），剪辑软件直接能吃
- `saturation` 只作用在成品层（ffmpeg `eq`），不动场景光照，也不污染页面观感
- ffmpeg 不可用时自动回退到 `file = raw`

## AI 调用示例

```bash
# 先看有什么机位
curl -s http://127.0.0.1:8789/shots

# 录一段云霄飞车跟拍
curl -s -XPOST http://127.0.0.1:8789/record \
  -H 'Content-Type: application/json' \
  -d '{"shot":"coaster-chase","duration":8,"fps":30,"saturation":1.3}'

# 批量出样片
./shoot-demo.sh "coaster-chase fpv-chase balloon-chase" 8
```

## 页面内 API（任何能驱动浏览器/CDP 的 AI 都能直接用）

```js
XM.shots()                                  // 机位列表
XM.shot('museum-gate')                      // 切机位
XM.record({shot:'fpv-chase',duration:8})     // → {mime,size,base64}
XM.setQuality(true)                         // 开高画质（默认录制时自动开）
XM.debug()                                  // 场景状态快照：相机位姿/roll/fps/drawcall
XM.stop()                                   // 停掉设施与导演机位
```

`XM.debug()` 返回示例：

```json
{ "fps": "42 FPS",
  "cam": { "pos": [-12.3, 4.1, 30.2], "yaw": 12.4, "pitch": -3.1, "roll": 0 },
  "draw": { "calls": 1754, "tris": 777046 },
  "quality": true, "dpr": 1, "shot": "coaster-chase" }
```

排查「画面颠不颠」「掉不掉帧」时，用它取数值，不用截图肉眼比对。

## 机位表（19 个）

静态风景（12）：`museum-gate` 艺术馆正门、`plaza-night` 中央广场夜景、`fair-gate` 游乐园鎏金门楼、
`church-front` 教堂正门、`theatre-front` 百老汇剧院、`anime-plaza` 动漫雪园中轴、`market-lane` 圣诞市集街、
`fountain-garden` 喷泉花园、`tree-avenue` 雪松大道、`meteor-sky` 流星雨天空、`balloon-ground` 热气球仰拍、
`balloon-above` 热气球高空俯瞰。

动态跟拍（7）：`coaster-chase` 云霄飞车、`fpv-chase` 穿越机、`train-chase` 观光小火车、
`carousel-chase` 旋转木马、`wheel-chase` 摩天轮、`sleigh-chase` 驯鹿雪橇、`balloon-chase` 热气球升空。

## 设计约束

- **导演机位与玩家视角彻底解耦**：每帧在渲染前覆写相机，玩家在不在走路都不影响取景。
- **画面不颠**：动态机位一律指数平滑跟随，位置分轴平滑（水平跟得快、高度跟得慢），相机 up 恒为世界竖直方向 —— 不继承过山车的轨道翻滚，也不继承穿越机的压弯与桶滚。
- **跟拍走「斜后方侧移」**：视线看向车前方而不是轨道切线方向（切线在下坡段朝下，会变成鸟瞰）。
- **逐帧精确录制**：`captureStream(0)` + 每帧 `requestFrame`，不丢帧、不受后台标签页节流影响；转 mp4 时统一转成 CFR。
- **提色放成品层**：夜景冷蓝月光 + ACES 会洗掉彩度，用 ffmpeg `eq=saturation` 在成品层拉回来，可参数化，不动场景光照。

### 实测平稳度（200 帧采样，`probe_smooth.js`）

| 机位 | roll 摆幅 | 俯仰变化 | 每帧位移 avg/max | jerk max |
|---|---|---|---|---|
| coaster-chase | 0.00° | 0.0° | 0.120 / 0.288 m | 0.110 |
| fpv-chase | 0.00° | 0.0° | 0.111 / 0.237 m | 0.080 |
| train-chase | 0.00° | 0.0° | 0.316 / 0.621 m | 0.400 |
| carousel-chase | 0.00° | 0.0° | 0.040 / 0.054 m | 0.018 |
| balloon-chase | 0.00° | 0.0° | 0.058 / 0.089 m | 0.054 |

roll 全程为 0 —— 相机没有一帧被带歪。

## 调试脚本

| 文件 | 作用 |
|---|---|
| `probe_smooth.js` | 采样相机位姿，量化 roll / 位移 / jerk（判断画面颠不颠） |
| `probe_gpu.js` | 对比不同渲染配置的 GPU 后端与真实帧率 |
| `probe_console.js` | 抓页面 console 与 pageerror（shader 编译失败等） |
| `shoot-demo.sh` | 批量出样片 |

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `XM_PORT` | 8789 | 监听端口 |
| `XM_SITE` | 线上站点 | 场景地址 |
| `XM_OUT` | `~/Desktop/xm-shots` | 产物目录 |
| `XM_WIDTH` / `XM_HEIGHT` | 1280 / 720 | 渲染分辨率 |
| `XM_CHROME` | 本机 ms-playwright chromium | 浏览器路径 |
