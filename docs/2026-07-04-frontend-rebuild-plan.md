# 三星堆考古体验 · 前端重构计划

> 日期:2026-07-04
> 目标:推倒旧 `index.html`(画面空、除灰是刷子非电击、桌面装饰不显示),按星露谷俯视像素风格重建完整 4 场景体验;后端与 AR 追踪按模块重组并**逐行保留已验证逻辑**。

## 一、决策(已与用户确认)

| 项 | 决定 |
|---|---|
| 删除范围 | 全部推倒(index.html + ar.html + server.js) |
| 代码架构 | 拆成模块化多文件(js/ + css/ + server/) |
| 美术方案 | 混合:程序化地形/UI + 原创像素 sprite(工具/装饰/碎片/面具),全原创不使用星露谷原图素材 |

### 关于"推倒后端"的工程判断
`server.js` 里的**腾讯云 TC3-HMAC-SHA256 签名 + 混元3D 轮询 + seedream 调用**是唯一被验证能调通的部分。重构策略:**结构推倒重组(拆 tencent.js / ark.js),但签名与 API 协议逻辑逐行保留**——结构可换,协议不赌。
AR 追踪(`facialTransformationMatrixes → maskGroup lerp/slerp`)同理:页面外壳重写,追踪核心保留。

## 二、删除清单

- **重写**:`index.html`、`ar.html`、`server.js`
- **清垃圾**:`test-*.py`、`viewer.html`、`viewer-shot.png`、`shot-*.png`、`current-dig.png`、`dig-big*.png`、`ground-*.png`、`mine-*.png`、`stardew-*.png`、`screenshot-dig.png`、`test-*.png`
- **保留不动**:`public/fragments/*`、`碎片/`、`视觉系统设计文档/`、`ai-mask-3d-generator/`、`package.json`、`vite.config.js`、`.env`、`docs/`

## 三、新目录架构

```
index.html              # 入口,只引 css/js
css/style.css           # 暖土色调 UI / 弹窗 / 进度条 / 场景容器
js/
 ├ main.js              # 状态机 + 场景切换 + 主循环调度
 ├ data.js             # 4 部位文案 + 历史介绍 + 青铜面具总介绍
 ├ pixel.js            # 像素引擎:sprite 数据 → canvas + 原创 sprite 图集
 ├ scene-dig.js        # 场景1 泥土坑挖掘
 ├ scene-table.js      # 场景2 考古桌电击除灰
 ├ scene-puzzle.js     # 场景3 拖动拼合 + 白光
 ├ scene-result.js     # 场景4 AI 修复 + 抠图 + 佩戴
 └ api.js              # 后端接口封装(health / generate-full-mask)
ar.html                 # 重写外壳,保留追踪核心(?mask=<glbUrl>)
server/
 ├ server.js           # Express 入口 + 路由
 ├ tencent.js          # TC3-HMAC 签名 + 混元3D(保留)
 └ ark.js              # seedream 文生图/图生图/多图融合(保留)
```

## 四、四场景规格(严格按用户描述)

### 场景1 · 泥土坑挖掘
- 俯视像素泥土坑,洛阳铲光标
- **每点一下挖出一个小坑**(露出更深土层),洛阳铲逐点探洞的机制
- 碎片**随机分布**在坑里,一块碎片覆盖多个格子;要把它**覆盖的全部格子都挖开**才算完全出土 → 冒金光 → 点击收集
- 收集完 4 块 → 自动切场景2

### 场景2 · 考古桌电击除灰
- 像素俯视桌面,桌上摆**原创像素装饰**:考古工具、花、书本、台灯、放大镜
- 拿桌上的**电击除灰仪**(非刷子)在碎片上拖动,**电弧特效** + 灰尘逐格消散
- 单块除净 → 显碎片原样 + **弹提示框**(部位名 + 历史介绍,来自 data.js)
- 4 块全清 → 切场景3

### 场景3 · 拖动拼合
- 4 块碎片拖到正确位置吸附,全部到位 → **全屏白色闪光动画** → 显示完整面具

### 场景4 · AI 修复 + 佩戴
- 调 `/api/generate-full-mask` → AI 修复图 → **抠白底成透明面具** → 光晕展示
- **弹窗介绍青铜纵目面具** + 「佩戴面具」按钮
- 点佩戴 → 生成 3D 模型 → 跳 `ar.html?mask=<glbUrl>`,人脸追踪把 3D 面具**像特效一样套头上**

## 五、美术(混合,全原创)

- **程序化**:泥土坑土层/网格、桌面木纹、UI、闪光/电弧/粒子
- **原创像素 sprite**:洛阳铲、电击除灰仪、放大镜/毛刷、花、书本、台灯、4 块碎片像素外观 —— 像素数据数组绘制,俯视风格神似星露谷但零原图素材
- 全局暖土色调 + 像素网格 + 抖动阴影

## 六、验证

每完成一个场景:Playwright 起服务 + 强制切场景截图,亲眼看渲染 + 0 报错,再进下一个。场景4 的 AI→3D→AR 先用 `/api/health` 确认后端密钥可用。

## 七、不做(YAGNI)

多组碎片、账号存档、移动端、音效;不动 `视觉系统设计文档/`、`ai-mask-3d-generator/`。

## 八、集成契约(新前端必须对齐)

- `GET /api/health` → `{ ok, arkModel }`
- `POST /api/generate-full-mask` `{ maskImage, patternImage }` → `{ repairedUrl, views, glbUrl }`
- 碎片图:`/fragments/{top-left,top-right,bottom-left,bottom-right,complete}.png`
- 跳转:`ar.html?mask=<glbUrl>`(有 3D)或 `ar.html?img=<url>`(fallback)
