# Backend Academic Database

这个目录提供一个轻量后端资料库，用来给 `fragments/` 中的 AI 生图碎片补充学术资料、文化解释、交互文案和素材路径。

## 数据文件

- `data/fragments-academic.json`

结构对应根目录素材：

- `fragments/{id}/{id}-full.png`
- `fragments/{id}/{id}-topleft.png`
- `fragments/{id}/{id}-topright.png`
- `fragments/{id}/{id}-lowleft.png`
- `fragments/{id}/{id}-lowright.png`

注意：这些图片是 AI 生成教学素材，资料库中的学术说明用于文化语境解释，不应当当作对生成图像的文物精确鉴定。

## 启动接口

```bash
cd backend
npm run check
npm start
```

默认端口：`3002`

## API

```http
GET /api/health
GET /api/fragments
GET /api/fragments/:id
GET /api/fragments/:id/academic
```

前端可先请求 `/api/fragments` 渲染碎片列表，再按 id 请求完整学术资料。