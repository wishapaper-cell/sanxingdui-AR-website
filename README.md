# 三星堆考古挖掘 → AI 修复 → AR 戴脸 完整体验系统

一个无硬编码、可独立跑通的浏览器端完整体验:从鼠标拖动铲子在考古坑挖掘青铜碎片,到刷子扫尘显露真容,再到拼合闪光、选择古蜀纹样、AI 融合修复、三视角生成 3D 模型,最后戴到脸上跟随面部表情实时追踪。

## 体验流程(6 步)

```
考古挖掘 → 刷子扫尘 → 拼合闪光 → 选纹样 → AI 融合生图 → 三视角图生3D + AR 戴脸
```

1. **考古挖掘**:鼠标变铲子,在土层上拖动寻找 4 块埋藏的青铜碎片
2. **刷子扫尘**:4 块碎片被尘土覆盖,鼠标变刷子扫过(达到 70% 显露)清除,弹出部位介绍
3. **拼合闪光**:4 块碎片按左上/右上/左下/右下拖到拼图区,集齐后闪光动画显示完整面具
4. **选择纹样**:3 种程序生成 SVG 纹样(纵目纹/太阳纹/云雷纹)任选一种
5. **AI 修复**:seedream 多图融合(面具图 + 纹样图)→ seedream 图生图四视角 → 混元3D 多视角融合 GLB
6. **AR 戴脸**:跳转 `ar.html?mask=<glbUrl>`,自动加载 GLB 到 maskGroup 跟随脸部

## 技术栈

| 层 | 技术 |
|---|---|
| 前端体验页 | 原生 HTML + Canvas 2D + CSS(Vite dev server) |
| AR 追踪 | Three.js + MediaPipe FaceLandmarker + GLTFLoader + EffectComposer/UnrealBloom |
| 后端代理 | Node.js + Express,原生 crypto 实现 TC3-HMAC-SHA256 签名 |
| 文生图/图生图/多图融合 | 火山引擎方舟 seedream 4.0(`doubao-seedream-4-0-250828`) |
| 图生 3D | 腾讯云混元3D(`SubmitHunyuanTo3DProJob`,Model 3.1 多视角融合) |

## 项目结构

```
sanxingdui-ar-tracker/
├── index.html                  # 主入口:考古体验 6 步流程
├── ar.html                     # AR 戴脸页(从 视觉系统设计文档/index.html 改造,支持 ?mask=<url>)
├── server.js                   # 后端:5 个 API 接口(健康检查/多图融合/四视角/图生3D/一站式)
├── package.json                # 依赖 + 脚本(dev/server/all/build/preview)
├── vite.config.js              # Vite 配置(/api 代理到 3001)
├── .env.example                # 环境变量示例
├── .gitignore
├── public/
│   └── fragments/              # 碎片图片(从 碎片/1/ 复制,英文名避免路径编码问题)
│       ├── top-left.png
│       ├── top-right.png
│       ├── bottom-left.png
│       ├── bottom-right.png
│       └── complete.png
├── docs/
│   ├── 2026-07-04-archaeology-mask-experience-design.md   # 体验设计 spec
│   └── 2026-07-04-archaeology-mask-experience-plan.md     # 实施计划
├── 视觉系统设计文档/             # 原 AR 系统(作为 ar.html 改造来源,保留不动)
└── ai-mask-3d-generator/       # 独立模块(文生图图生3D,已上传 GitHub main)
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置密钥

复制 `.env.example` 为 `.env`,填入真实密钥:

```bash
# 腾讯云(用于混元3D,SecretId 以 AKID 开头)
# 获取:https://console.cloud.tencent.com/cam/capi
TENCENTCLOUD_SECRET_ID=AKIDxxxxxxxxxx
TENCENTCLOUD_SECRET_KEY=xxxxxxxxxx
TENCENTCLOUD_REGION=ap-guangzhou

# 火山引擎方舟(用于 seedream 文生图/图生图/多图融合)
# 获取:https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey
ARK_API_KEY=ark-xxxxxxxxxx
ARK_SEEDREAM_MODEL=doubao-seedream-4-0-250828
```

**需提前开通的服务**:
- 腾讯云混元3D(ai3d 产品,需在控制台开通)
- 火山引擎方舟 seedream 4.0 模型(需在方舟控制台开通对应模型)

### 3. 启动

```bash
npm run all     # 同时启动后端(3001)+ 前端(5180)
```

或分两个终端:

```bash
npm run server  # 后端 http://127.0.0.1:3001
npm run dev     # 前端 http://127.0.0.1:5180
```

### 4. 体验

打开 http://127.0.0.1:5180/ ,按提示完成 6 步体验。

## API 接口

| 路由 | 方法 | 用途 |
|---|---|---|
| `/api/health` | GET | 健康检查,返回模型配置 |
| `/api/repair-mask` | POST | 多图融合:面具图 + 纹样图 → 修复后面具图 |
| `/api/multiview-from-image` | POST | 单图生四视角(正/左/右/后,同一 seed 保证造型一致) |
| `/api/image-to-3d` | POST | 单图图生3D(Pro→Rapid fallback) |
| `/api/image-to-3d-multi` | POST | 多视角图生3D(Model 3.1) |
| `/api/generate-full-mask` | POST | 一站式:多图融合修复 → 四视角生图 → 多视角图生3D |

## 无硬编码原则

- 所有密钥走 `.env`,通过 `process.env` 读取
- 所有 API 走 Vite 代理 `/api/*`,前端不暴露密钥
- GLB URL 通过 URL 参数传递(`ar.html?mask=<encoded>`),不写死
- 碎片/纹样资源走相对路径 `/fragments/xxx.png`
- 模型 ID 从后端读取(`/api/health` 返回)

## 关键文件说明

### `index.html`(主入口)

6 个 `<section>` 通过 `display` 切换,JS 状态机控制流程:

- **Step 1 挖掘**:Canvas 2D 程序生成土壤纹理(土黄渐变 + 噪点 + 散布石子),4 个埋藏点随机分布,鼠标累积停留 600ms 触发"发现碎片"
- **Step 2 刷尘**:4 个独立 Canvas,每个底层是碎片 PNG,顶层是土色遮罩,鼠标拖动用 `destination-out` 合成模式擦除,实时计算透明像素百分比,达 70% 视为干净
- **Step 3 拼合**:HTML5 Drag API + 2x2 网格吸附,4 块都拼对后触发 CSS 闪光动画(`flashBurst` keyframe)+ 显示完整面具图
- **Step 4 选纹样**:3 个 SVG(纵目纹/太阳纹/云雷纹)程序生成,选中后高亮
- **Step 5 AI 生成**:SVG 转 PNG dataURL → POST `/api/generate-full-mask` → 显示修复图 + 四视角 + 进度
- **Step 6 跳转 AR**:`location.href = 'ar.html?mask=' + encodeURIComponent(glbUrl)`

### `ar.html`(AR 戴脸页)

从 `视觉系统设计文档/index.html` 改造而来,关键改动:

1. 隐藏 `#gen-panel`(AI 面具生成面板,因为生成已在主入口完成)
2. 添加 `#mask-loader` 提示条(顶部居中,显示加载状态)
3. 在 `startBtn` click 后调用 `autoLoadMaskFromUrl()`:
   - 解析 `?mask=<url>` 参数
   - 用 `GLTFLoader` 加载 GLB
   - 调用 `attachCustomMask(glb.scene)` 挂到 `maskGroup` 跟随脸部
   - 无参数时显示提示并保留程序化默认青铜纵目面具
4. 保留所有原 AR 追踪逻辑(MediaPipe 468 关键点 + Three.js PBR 材质 + 认主解锁 + 手势)

### `server.js`(后端代理)

- 原生 `crypto` 实现 TC3-HMAC-SHA256 签名(不依赖腾讯云 SDK)
- `submitAndPoll()` 通用轮询:submit → JobId → 循环 query 直到 DONE/FAIL
- seedream 三种调用:文生图、单图图生图、多图融合(`image` 参数支持数组)
- 混元3D `imageTo3D()`:Pro→Rapid fallback,多视角用 Model 3.1 + `MultiViewImages`
- 一站式接口 `generate-full-mask`:修复 → 四视角 → 多视角图生3D

## 端到端测试

测试脚本:`test-smoke.py`(Playwright)

```bash
python test-smoke.py
```

验证:
- index.html 加载,Step 1 渲染,canvas 初始化,铲子光标显示
- 挖掘交互(模拟拖动)
- ar.html 加载,标题正确,gen-panel 已隐藏
- 0 JS 错误,0 警告

## 常见问题

### 后端启动失败:未配置 SECRET_ID / ARK_API_KEY
检查 `.env` 文件是否存在且包含真实密钥。

### 调用 seedream 报 "has not activated"
需在火山引擎方舟控制台开通 `doubao-seedream-4-0-250828` 模型。

### 调用混元3D 报 "ResourceInsufficient"
腾讯云服务端临时资源不足,后端会自动 fallback 到 Rapid 极速版,持续失败请稍后重试。

### ar.html 显示"未指定面具参数"
需从 `index.html` 完整走完 6 步流程后自动跳转,或手动访问 `ar.html?mask=<glbUrl>`。

### 端口被占用
- 后端 3001:`.env` 中改 `PORT`
- 前端 5180:`vite.config.js` 中改 `server.port`
- 同步更新 `vite.config.js` 中的 `proxy./api.target`

## 保留模块

- `视觉系统设计文档/`:原 AR 系统完整版本(作为 `ar.html` 的改造来源,保留不动)
- `ai-mask-3d-generator/`:独立模块,文生图图生3D 单独可用,已上传 GitHub main

## 不做的事(YAGNI)

- 不做多组碎片(只用 1 组 4 块)
- 不做用户账号/存档/分享
- 不做移动端适配(桌面浏览器优先)
- 不做音效(可后续加)
- 不破坏现有 `视觉系统设计文档/` 和 `ai-mask-3d-generator/` 模块
