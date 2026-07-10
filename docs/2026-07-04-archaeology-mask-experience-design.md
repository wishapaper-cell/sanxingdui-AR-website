# 三星堆考古挖掘→AI 修复→AR 戴脸 完整体验系统设计

**日期**:2026-07-04
**基于**:现有 GitHub main 分支(主 AR 系统 + ai-mask-3d-generator 模块)
**目标**:无硬编码、可独立跑通的完整体验流程

## 1. 体验流程(6 步)

```
考古挖掘 → 刷子扫尘 → 拼合闪光 → 选纹样 → AI 融合生图 → 三视角图生3D+AR戴脸
```

### Step 1 — 考古挖掘(交互式前端)
- 画面:考古坑(Canvas 2D,土黄色 + 噪点纹理),4 个埋藏点随机分布(不可见)
- 鼠标变成铲子 SVG cursor,用户拖动挖掘
- 碰到埋藏点时,土壤隆起动画,显示"发现碎片!"提示
- 4 块碎片挖完,自动进入 Step 2

### Step 2 — 刷子扫尘(交互式前端)
- 鼠标变刷子 cursor,4 块碎片排成一行(尘土覆盖:CSS blur + grayscale + 半透明土色遮罩)
- 拖动刷子扫过,Canvas 记录扫过区域,土色遮罩透明度渐变降低,碎片图案显现
- 全部刷干净后,每块碎片弹出部位介绍卡片:
  - 左上 → 左眼眶纵目:"凸出眼柱象征古蜀人超越凡人的远视神力"
  - 右上 → 右眼眶纵目:"与左眼对称,共构千里眼神性"
  - 左下 → 左鼻翼嘴角:"青铜铸造的威严肃穆感"
  - 右下 → 右鼻翼嘴角:"面具下颌力量来源"

### Step 3 — 拼合闪光(交互式前端)
- 4 块碎片拖拽到中心拼图区(2x2 网格吸附)
- 拼齐后触发闪光动画:白色光晕从中心扩散(CSS keyframes,1.5 秒)
- 光晕消散后显示无缝完整面具图(用 `public/fragments/complete.png`,即原 `1-完整.png`)

### Step 4 — 选纹样(交互式前端)
- 显示拼合好的面具图
- 下方 3 个纹样选项卡(程序生成 SVG,无外部素材依赖):
  - 纵目纹:同心圆 + 中心凸点
  - 太阳纹:中心圆 + 放射线
  - 云雷纹:回字螺旋纹
- 选一个高亮,显示"开始 AI 修复"按钮

### Step 5 — AI 融合生图(后端 + 前端)
- 前端把拼合面具图 + 选中的纹样 SVG(转 PNG dataURL)上传到后端
- 后端 `POST /api/repair-mask`:调 seedream 多图融合
  - `image: [拼合面具图URL, 纹样图URL]`
  - `prompt: "将图2的纹样融合到图1的面具上,保持面具造型,叠加纹样浮雕,青铜材质,三星堆古蜀风格,纯白背景,高细节"`
  - 返回融合后的完整面具图 URL
- 前端显示古蜀纹样流动加载动画,约 20-40 秒

### Step 6 — 三视角图生图 + 3D 建模 + AR 戴脸
- 后端 `POST /api/multiview-from-image`:用融合图作为参考,调 4 次 seedream 图生图
  - prompt 分别加:正面视图 / 左侧视图 / 右侧视图 / 后视图
  - 同一 seed 保证造型一致
- 4 张视角图 → `POST /api/image-to-3d-multi` → 混元3D 多视角融合 → GLB
- 前端跳转 `ar.html?mask=<encodeURIComponent(glbUrl)>`,AR 页自动加载 GLB 挂到 maskGroup 跟随脸部

## 2. 文件结构

```
sanxingdui-ar-tracker/
├── index.html                  # 新主入口:考古体验流程(Step 1-5)
├── ar.html                     # AR 戴脸页(从 视觉系统设计文档/index.html 改造)
├── server.js                   # 后端:seedream 多图融合 + 图生图 + 混元3D
├── public/
│   ├── fragments/
│   │   ├── top-left.png        # 从 碎片/1/1-左上.png 复制(英文文件名避免路径编码问题)
│   │   ├── top-right.png       # 从 1-右上.png 复制
│   │   ├── bottom-left.png     # 从 1-左下.png 复制
│   │   ├── bottom-right.png    # 从 1-右下.png 复制
│   │   └── complete.png        # 从 1-完整.png 复制(拼合闪光后显示)
│   └── patterns/               # 纹样 SVG(运行时生成或预置文件)
│       ├── eye.svg             # 纵目纹
│       ├── sun.svg             # 太阳纹
│       └── thunder.svg         # 云雷纹
├── package.json
├── vite.config.js              # /api 代理到 3001
├── .env                        # 密钥(不入 git)
├── .env.example
├── .gitignore
└── README.md
```

**保留现有模块**(不动):
- `视觉系统设计文档/` — 原 AR 系统(作为 ar.html 的来源参考)
- `ai-mask-3d-generator/` — 独立模块(已上传 GitHub)
- `docs/` — 设计文档

## 3. 后端接口(server.js)

复用 `ai-mask-3d-generator/server.js` 的签名和轮询逻辑,新增 3 个接口:

### 3.1 `POST /api/repair-mask`(多图融合)
- **入参**:`{ maskImage: <url|base64>, patternImage: <base64> }`
- **流程**:调 seedream `image: [maskImage, patternImage]`,prompt 描述融合
- **出参**:`{ url: <融合图URL> }`
- **注意**:纹样图是前端 SVG 转 PNG dataURL,需先上传到临时存储或直接传 base64(seedream 支持 base64)

### 3.2 `POST /api/multiview-from-image`(单图生四视角)
- **入参**:`{ imageUrl: <url> }`
- **流程**:并行调 4 次 seedream 图生图,同一 seed,prompt 加视角描述
- **出参**:`{ views: [{view: "front|left|right|back", url}, ...] }`

### 3.3 `POST /api/generate-full-mask`(一站式)
- **入参**:`{ maskImage, patternImage }`
- **流程**:repair-mask → multiview-from-image → image-to-3d-multi
- **出参**:`{ repairedUrl, views, glbUrl }`
- **用于**:前端一步到位调用,避免多次请求

### 复用接口(从 ai-mask-3d-generator 迁移)
- `GET /api/health`
- `POST /api/image-to-3d-multi` — 多视角图生3D
- `POST /api/image-to-3d` — 单图图生3D
- `POST /api/text-to-image` — 文生图(保留,备用)

### seedream 多图融合请求格式(已查证官方文档)
```json
{
  "model": "doubao-seedream-4-0-250828",
  "prompt": "将图2的纹样融合到图1的面具上...",
  "image": ["url1", "url2"],
  "sequential_image_generation": "disabled",
  "size": "2048x2048",
  "watermark": false
}
```

## 4. 前端实现要点

### 4.1 主入口 index.html(考古体验)
- **单文件**,Three.js 不需要(只有 Canvas 2D + DOM)
- **6 个 section**,用 CSS display 切换,JS 控制流程状态机
- **挖掘交互**:Canvas 2D,鼠标轨迹检测碰撞埋藏点
- **刷尘交互**:Canvas 2D,记录鼠标轨迹,destination-out 合成模式擦除土色遮罩
- **拼合**:HTML5 Drag API + 2x2 网格吸附
- **闪光**:CSS keyframes 白色光晕扩散
- **纹样 SVG**:内嵌 SVG,选中的转 PNG dataURL 上传

### 4.2 AR 页 ar.html
- 从 `视觉系统设计文档/index.html` 复制
- **改造点**:
  1. URL 参数解析:`new URLSearchParams(location.search).get('mask')`
  2. 若有 mask 参数,启动后自动调 `attachCustomMask(glbUrl)` 加载自定义 GLB
  3. 删除左下角的"AI 面具生成面板"(已经在主入口完成生成)
  4. 保留所有 AR 追踪逻辑(MediaPipe + Three.js + 认主 + 手势)

### 4.3 无硬编码原则
- 所有密钥走 `.env`(SECRET_ID / SECRET_KEY / ARK_API_KEY / ARK_MODEL)
- 所有 API 走 `/api/*` Vite 代理,不暴露密钥到前端
- GLB URL 通过 URL 参数传递(ar.html?mask=...),不写死
- 碎片/纹样资源走相对路径 `/fragments/xxx.png`
- 接口地址、模型 ID 全部从后端读取(/api/health 返回模型信息)

## 5. 纹样 SVG 设计(程序生成,无外部依赖)

三个纹样作为 SVG 内嵌,选中后用 Canvas 转 PNG dataURL 上传:

- **纵目纹**:同心圆(外径 80,内径 40)+ 中心凸点(半径 15),青铜色 #8B5A2B
- **太阳纹**:中心圆(半径 30)+ 12 条放射线(长 60),金色 #D4A017
- **云雷纹**:回字螺旋(3 层嵌套方形 + 螺旋角),青铜绿 #3DD68C

## 6. 错误处理与降级

- **seedream 调用失败**:显示错误,允许重试
- **混元3D ResourceInsufficient**:fallback 到 Rapid 极速版(已有逻辑)
- **碎片图片加载失败**:控制台报错,流程卡住(可接受,资源在同仓库不会失败)
- **AR 页 mask 参数缺失**:显示提示"请先从主页生成面具"
- **后端未启动**:前端 /api/health 检测,显示"请先启动后端 npm run server"

## 7. 启动方式

```bash
npm install
cp .env.example .env  # 填密钥
npm run all           # 同时启动后端(3001)和前端(5180)
# 打开 http://127.0.0.1:5180/
```

## 8. 测试验证清单

- [ ] 后端 /api/health 返回 ok
- [ ] 后端 /api/repair-mask 用真实图片测试多图融合
- [ ] 后端 /api/multiview-from-image 测试四视角生成
- [ ] 前端挖掘交互:4 个埋藏点能挖出碎片
- [ ] 前端刷尘交互:刷子能擦除土色遮罩
- [ ] 前端拼合:4 块拼齐触发闪光
- [ ] 前端纹样选择:3 个纹样能选中并高亮
- [ ] 端到端:完整流程跑通,生成 GLB 戴到脸上
- [ ] ar.html?mask=<url> 能自动加载 GLB

## 9. 不做的事(YAGNI)

- 不做多组碎片(只用 1 组)
- 不做用户账号/存档
- 不做分享功能
- 不做移动端适配(桌面浏览器优先)
- 不做音效(可后续加)
- 不破坏现有的 `视觉系统设计文档/` 和 `ai-mask-3d-generator/`
