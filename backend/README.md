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
## Three Real Mask Library

New files:

- `data/mask-library.json`
- `data/mask-library.schema.md`

Current prototype mask IDs:

- `adult_mask`: 大人面具
- `large_protruding_eye_beast_mask`: 大型纵目兽面具
- `ritual_gold_mask`: 祭祀金面具

Main fields for your manual academic filling:

- `prototypeMasks[].academicProfile`
- `prototypeMasks[].fragments[].academicNoteTodo`
- `prototypeMasks[].fragments[].sourceCitationTodo`
- `motifLibrary[].academicNoteTodo`

Image folders to fill:

```text
backend/public/assets/real-masks/{maskId}/full.png
backend/public/assets/real-mask-fragments/{maskId}/{fragmentId}.png
backend/public/assets/motifs/{motifId}.png
```

Public URL examples:

```text
/assets/real-masks/adult_mask/full.png
/assets/real-mask-fragments/adult_mask/adult_mask_brow.png
/assets/motifs/cloud_thunder.png
```

New API:

```http
GET /api/mask-library
GET /api/mask-library/motifs
GET /api/mask-library/generation-schema
GET /api/mask-library/masks/:id
GET /api/mask-library/masks/:id/fragments
```

The backend now serves `/assets/...` from `backend/public/assets/...`.
## Fragment Image Mapping

新增文件：

- `data/fragment-image-mapping.json`
- `data/fragment-image-mapping.schema.md`

这份数据库是根据仓库真实 `fragments/` 目录生成的，不是概念占位。

它会记录：

- `fragments/{id}/{id}-full.png`
- `fragments/{id}/{id}-topleft.png`
- `fragments/{id}/{id}-topright.png`
- `fragments/{id}/{id}-lowleft.png`
- `fragments/{id}/{id}-lowright.png`

如果某组缺图，也会记录在 `missingExpectedPartKeys`。

新接口：

```http
GET /api/fragment-image-mapping
GET /api/fragment-image-mapping/prototypes
GET /api/fragment-image-mapping/sets/:id
```