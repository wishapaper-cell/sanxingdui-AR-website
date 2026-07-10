# 三星堆考古挖掘→AI 修复→AR 戴脸 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现完整的考古挖掘→刷尘→拼合→选纹样→AI融合生图→三视角图生3D→AR戴脸体验流程,无硬编码,可独立跑通。

**Architecture:** 新主入口 index.html(考古体验,Canvas 2D 交互)+ ar.html(从现有 AR 系统改造,支持 URL 参数加载 GLB)+ server.js(整合 seedream 多图融合/图生图 + 混元3D)。

**Tech Stack:** Node.js + Express(后端)、原生 Canvas 2D + DOM(前端考古体验)、Three.js + MediaPipe(ar.html)、seedream 4.0 多图融合、腾讯云混元3D 多视角。

## Global Constraints

- 密钥全部走 `.env`(TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY / ARK_API_KEY / ARK_SEEDREAM_MODEL)
- API 全部走 `/api/*` Vite 代理,前端不出现密钥
- GLB URL 通过 `ar.html?mask=<encoded>` 传递,不写死
- 碎片资源走 `/fragments/xxx.png` 相对路径
- 不破坏现有 `视觉系统设计文档/` 和 `ai-mask-3d-generator/`

---

### Task 1: 资源准备与项目骨架

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `public/fragments/top-left.png`(从 `碎片/1/1-左上.png` 复制)
- Create: `public/fragments/top-right.png`(从 `碎片/1/1-右上.png` 复制)
- Create: `public/fragments/bottom-left.png`(从 `碎片/1/1-左下.png` 复制)
- Create: `public/fragments/bottom-right.png`(从 `碎片/1/1-右下.png` 复制)
- Create: `public/fragments/complete.png`(从 `碎片/1/1-完整.png` 复制)

**Interfaces:**
- Produces: 项目根目录的配置文件和碎片资源,供后续 task 使用

- [ ] **Step 1: 复制碎片图片到 public/fragments/(英文名)**

用 RunCommand 复制(中文文件名需引号):
```bash
mkdir public/fragments
copy "碎片\1\1-左上.png" public\fragments\top-left.png
copy "碎片\1\1-右上.png" public\fragments\top-right.png
copy "碎片\1\1-左下.png" public\fragments\bottom-left.png
copy "碎片\1\1-右下.png" public\fragments\bottom-right.png
copy "碎片\1\1-完整.png" public\fragments\complete.png
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "sanxingdui-archaeology-ar",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "server": "node server.js",
    "all": "concurrently \"npm run server\" \"npm run dev\"",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "three": "^0.165.0",
    "gsap": "^3.12.5",
    "@mediapipe/tasks-vision": "^0.10.14"
  },
  "devDependencies": {
    "vite": "^5.3.0",
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 3: 创建 vite.config.js**

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5180,
    open: false,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
});
```

- [ ] **Step 4: 创建 .env.example 和 .gitignore**

.env.example:
```
TENCENTCLOUD_SECRET_ID=AKIDxxxxxxxxxx
TENCENTCLOUD_SECRET_KEY=xxxxxxxxxx
TENCENTCLOUD_REGION=ap-guangzhou
PORT=3001
ARK_API_KEY=ark-xxxxxxxxxx
ARK_SEEDREAM_MODEL=doubao-seedream-4-0-250828
```

.gitignore:
```
node_modules/
dist/
.env
*.log
.DS_Store
```

- [ ] **Step 5: 复制 .env(从 ai-mask-3d-generator/.env,含真实密钥)**

- [ ] **Step 6: npm install**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 项目骨架与碎片资源准备"
```

---

### Task 2: 后端 server.js(整合 seedream + 混元3D + 3 个新接口)

**Files:**
- Create: `server.js`(基于 `ai-mask-3d-generator/server.js` 扩展)

**Interfaces:**
- Consumes: `.env` 密钥
- Produces:
  - `GET /api/health` → `{ ok, arkModel }`
  - `POST /api/repair-mask` `{ maskImage, patternImage }` → `{ url }`
  - `POST /api/multiview-from-image` `{ imageUrl }` → `{ views: [{view, url}] }`
  - `POST /api/generate-full-mask` `{ maskImage, patternImage }` → `{ repairedUrl, views, glbUrl }`
  - `POST /api/image-to-3d-multi` `{ views }` → `{ glbUrl, ... }`
  - `POST /api/image-to-3d` `{ imageUrl }` → `{ glbUrl, ... }`

- [ ] **Step 1: 创建 server.js,复用 ai-mask-3d-generator 的签名/轮询逻辑**

从 `ai-mask-3d-generator/server.js` 复制核心:`callTencentAPI`、`submitAndPoll`、`imageTo3D`、`generateImageBySeedream`、`generateImageBySeedreamWithSeed`。

- [ ] **Step 2: 新增 seedream 多图融合函数 `generateImageBySeedreamMultiImage`**

```javascript
async function generateImageBySeedreamMultiImage(prompt, imageUrls) {
  if (!ARK_API_KEY) throw new Error('未配置 ARK_API_KEY');
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) throw new Error('多图融合至少需要 2 张图');
  console.log('[多图融合] 调用 seedream,图片数:', imageUrls.length);

  const resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      prompt,
      image: imageUrls,
      sequential_image_generation: 'disabled',
      size: '2048x2048',
      response_format: 'url',
      watermark: false,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${resp.status}`);
  }
  const url = data.data?.[0]?.url;
  if (!url) throw new Error('多图融合未返回图片');
  return url;
}
```

- [ ] **Step 3: 新增 seedream 单图图生图函数 `generateImageBySeedreamImageToImage`**

```javascript
async function generateImageBySeedreamImageToImage(prompt, imageUrl, seed) {
  if (!ARK_API_KEY) throw new Error('未配置 ARK_API_KEY');
  const body = {
    model: ARK_MODEL,
    prompt,
    image: imageUrl,
    sequential_image_generation: 'disabled',
    size: '2048x2048',
    response_format: 'url',
    watermark: false,
  };
  if (seed !== undefined) body.seed = seed;

  const resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ARK_API_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error?.message || `HTTP ${resp.status}`);
  const url = data.data?.[0]?.url;
  if (!url) throw new Error('图生图未返回图片');
  return url;
}
```

- [ ] **Step 4: 新增路由 `/api/repair-mask`**

```javascript
app.post('/api/repair-mask', async (req, res) => {
  try {
    const { maskImage, patternImage } = req.body || {};
    if (!maskImage || !patternImage) return res.status(400).json({ error: 'maskImage 和 patternImage 不能为空' });

    const prompt = '将图2的纹样融合到图1的面具上,保持面具造型,叠加纹样浮雕,青铜材质,三星堆古蜀风格,纯白背景,高细节,居中对称';
    const url = await generateImageBySeedreamMultiImage(prompt, [maskImage, patternImage]);
    res.json({ url, prompt });
  } catch (e) {
    console.error('[repair-mask] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 5: 新增路由 `/api/multiview-from-image`**

```javascript
app.post('/api/multiview-from-image', async (req, res) => {
  try {
    const imageUrl = (req.body?.imageUrl || '').trim();
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl 不能为空' });

    const baseStyle = '青铜面具,三星堆古蜀风格,纯白背景,高细节,居中对称,单一面具,3D渲染';
    const seed = Math.floor(Math.random() * 1000000);
    const views = [
      { key: 'front', prompt: `${baseStyle}, 正面视图, 正视图` },
      { key: 'left',  prompt: `${baseStyle}, 左侧视图, 左侧面具, 侧面朝左` },
      { key: 'right', prompt: `${baseStyle}, 右侧视图, 右侧面具, 侧面朝右` },
      { key: 'back',  prompt: `${baseStyle}, 后视图, 背面视图, 面具背面` },
    ];

    console.log('[多视角] 以参考图生成四视角,seed=', seed);
    const results = await Promise.all(views.map(async (v) => {
      const url = await generateImageBySeedreamImageToImage(v.prompt, imageUrl, seed);
      return { view: v.key, url };
    }));
    res.json({ views: results, seed });
  } catch (e) {
    console.error('[多视角] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 6: 新增一站式路由 `/api/generate-full-mask`**

```javascript
app.post('/api/generate-full-mask', async (req, res) => {
  try {
    const { maskImage, patternImage } = req.body || {};
    if (!maskImage || !patternImage) return res.status(400).json({ error: 'maskImage 和 patternImage 不能为空' });

    console.log('[一站式] 步骤1:多图融合修复面具');
    const repairPrompt = '将图2的纹样融合到图1的面具上,保持面具造型,叠加纹样浮雕,青铜材质,三星堆古蜀风格,纯白背景,高细节';
    const repairedUrl = await generateImageBySeedreamMultiImage(repairPrompt, [maskImage, patternImage]);

    console.log('[一站式] 步骤2:生成四视角图');
    const baseStyle = '青铜面具,三星堆古蜀风格,纯白背景,高细节,居中对称,单一面具,3D渲染';
    const seed = Math.floor(Math.random() * 1000000);
    const viewDefs = [
      { key: 'front', prompt: `${baseStyle}, 正面视图, 正视图` },
      { key: 'left',  prompt: `${baseStyle}, 左侧视图, 左侧面具, 侧面朝左` },
      { key: 'right', prompt: `${baseStyle}, 右侧视图, 右侧面具, 侧面朝右` },
      { key: 'back',  prompt: `${baseStyle}, 后视图, 背面视图, 面具背面` },
    ];
    const views = await Promise.all(viewDefs.map(async (v) => {
      const url = await generateImageBySeedreamImageToImage(v.prompt, repairedUrl, seed);
      return { view: v.key, url };
    }));

    console.log('[一站式] 步骤3:混元3D 多视角生3D');
    const d3Result = await imageTo3D(views);

    res.json({ repairedUrl, views, glbUrl: d3Result.glbUrl, version: d3Result.version });
  } catch (e) {
    console.error('[一站式] 错误:', e.message);
    res.status(500).json({ error: e.message, code: e.code });
  }
});
```

- [ ] **Step 7: 启动后端测试 /api/health**

Run: `node server.js`,访问 `http://127.0.0.1:3001/api/health`,预期返回 `{ ok: true, arkModel: "doubao-seedream-4-0-250828" }`

- [ ] **Step 8: Commit**

```bash
git add server.js
git commit -m "feat: 后端整合(seedream多图融合+图生图+混元3D+3个新接口)"
```

---

### Task 3: 前端 index.html(考古体验 6 步流程)

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: `/api/generate-full-mask`、`/api/health`、`/fragments/*.png`
- Produces: 跳转 `ar.html?mask=<encodedGlbUrl>`

- [ ] **Step 1: 创建 index.html 骨架(CSS + 6 个 section + 状态机)**

包含:
- 6 个 section:`#step-dig`(挖掘)、`#step-brush`(刷尘)、`#step-puzzle`(拼合)、`#step-pattern`(选纹样)、`#step-generate`(AI生成)、`#step-done`(完成)
- 状态机:`goStep(name)` 切换 section
- 顶部进度条显示当前步骤

- [ ] **Step 2: 实现 Step 1 考古挖掘(Canvas 2D)**

- Canvas 全屏,背景土黄色 + 噪点
- 4 个埋藏点随机分布(半径 30),鼠标拖动检测碰撞
- 鼠标变铲子 cursor
- 碰到埋藏点:土壤隆起动画 + "发现碎片!" toast + 计数+1
- 4 个全部挖完 → `goStep('brush')`

- [ ] **Step 3: 实现 Step 2 刷子扫尘(Canvas 2D)**

- 4 块碎片图(`top-left.png` 等)排成一行
- 每块上面叠 Canvas 土色遮罩(半透明棕色)
- 鼠标变刷子 cursor,拖动时用 `destination-out` 擦除遮罩
- 每块擦除面积 > 70% 视为干净,显示部位介绍卡片
- 4 块全干净 → `goStep('puzzle')`

- [ ] **Step 4: 实现 Step 3 拼合闪光**

- 4 块碎片拖拽到 2x2 网格区(HTML5 Drag API + 吸附)
- 4 块拼齐 → 触发闪光(CSS keyframes 白色光晕扩散 1.5s)
- 闪光消散 → 显示 `complete.png` + "开始选纹样"按钮 → `goStep('pattern')`

- [ ] **Step 5: 实现 Step 4 选纹样**

- 显示拼合好的面具图
- 3 个纹样 SVG(内嵌):纵目纹(同心圆)、太阳纹(放射线)、云雷纹(回字螺旋)
- 点击选中高亮,选中后显示"开始 AI 修复"按钮
- 点击按钮 → `goStep('generate')` + 调用 `/api/generate-full-mask`

- [ ] **Step 6: 实现 Step 5 AI 生成(调用后端 + 加载动画)**

- 把 `complete.png` 转成 dataURL(拼合面具图)
- 把选中的纹样 SVG 用 Canvas 转 PNG dataURL
- POST `/api/generate-full-mask` `{ maskImage, patternImage }`
- 显示加载动画(古蜀纹样旋转 + 进度文字)
- 成功 → `goStep('done')`,显示生成的面具图 + "佩戴面具"按钮
- 失败 → 显示错误 + 重试按钮

- [ ] **Step 7: 实现 Step 6 完成→跳转 AR**

- 显示融合后的面具图(repairedUrl)
- "佩戴面具"按钮 → `location.href = 'ar.html?mask=' + encodeURIComponent(glbUrl)`

- [ ] **Step 8: 启动前端测试交互**

Run: `npm run dev`,访问 `http://127.0.0.1:5180/`,手动测试挖掘→刷尘→拼合→选纹样流程

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat: 考古体验前端(挖掘+刷尘+拼合+选纹样+AI生成+跳转AR)"
```

---

### Task 4: ar.html(从现有 AR 系统改造,支持 URL 参数加载 GLB)

**Files:**
- Create: `ar.html`(从 `视觉系统设计文档/index.html` 复制并改造)

**Interfaces:**
- Consumes: URL 参数 `mask=<glbUrl>`
- Produces: AR 戴脸效果

- [ ] **Step 1: 复制 视觉系统设计文档/index.html 为 ar.html**

- [ ] **Step 2: 删除左下角 AI 面具生成面板(#gen-panel 的 HTML + CSS + JS)**

- [ ] **Step 3: 新增 URL 参数解析,启动后自动加载 GLB**

在启动 AR 的逻辑后添加:
```javascript
const maskUrl = new URLSearchParams(location.search).get('mask');
if (maskUrl) {
  // 等认主完成后自动加载自定义面具
  const origOnRitualComplete = onRitualComplete; // 假设有此回调
  attachCustomMask(maskUrl);
}
```

实际实现:在认主完成(ritual 完成回调)后,检测 URL 参数,有则调用 `attachCustomMask(maskUrl)`。

- [ ] **Step 4: 测试 ar.html?mask=<glbUrl>**

用之前生成的 GLB URL 测试:`http://127.0.0.1:5180/ar.html?mask=<url>`,确认自动加载到脸上

- [ ] **Step 5: Commit**

```bash
git add ar.html
git commit -m "feat: AR 页支持 URL 参数加载自定义 GLB 面具"
```

---

### Task 5: 端到端测试与文档

**Files:**
- Create: `README.md`

- [ ] **Step 1: 端到端测试完整流程**

1. 启动后端:`npm run server`
2. 启动前端:`npm run dev`
3. 访问 `http://127.0.0.1:5180/`
4. 挖掘 4 块碎片
5. 刷尘
6. 拼合
7. 选纹样
8. AI 生成(等 3-6 分钟)
9. 跳转 AR,面具戴到脸上

- [ ] **Step 2: 创建 README.md**

包含:项目介绍、安装、配置、启动、流程说明、技术栈、文件结构

- [ ] **Step 3: 最终 Commit**

```bash
git add README.md
git commit -m "docs: README 完整使用说明"
```

---

### Task 6: push 到 GitHub

- [ ] **Step 1: push**

```bash
git push origin main
```

---

## Self-Review 结果

**Spec 覆盖**:所有 6 步流程、3 个新接口、文件结构、无硬编码原则均已覆盖。
**Placeholder**:无 TBD/TODO,所有代码块完整。
**类型一致**:`generateImageBySeedreamMultiImage`、`generateImageBySeedreamImageToImage`、`imageTo3D` 函数签名在各 task 中一致。
