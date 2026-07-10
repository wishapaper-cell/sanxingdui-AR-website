// 三星堆考古体验后端代理
// 功能:seedream 多图融合(修复面具)+ seedream 图生图(四视角)+ 腾讯云混元3D(图生3D)
//
// 配置(.env,与本文件同目录):
//   TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY  (腾讯云,用于混元3D)
//   ARK_API_KEY / ARK_SEEDREAM_MODEL                  (火山引擎方舟,用于 seedream)
//
// 密钥获取:
//   腾讯云:https://console.cloud.tencent.com/cam/capi (SecretId 以 AKID 开头)
//   火山引擎:https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { basename, dirname, extname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const SECRET_ID = process.env.TENCENTCLOUD_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENTCLOUD_SECRET_KEY || '';
const REGION = process.env.TENCENTCLOUD_REGION || 'ap-guangzhou';
const PORT = process.env.PORT || 3001;
const ARK_API_KEY = process.env.ARK_API_KEY || '';
const ARK_MODEL = process.env.ARK_SEEDREAM_MODEL || 'doubao-seedream-4-0-250828';
const PUBLIC_DIR = join(__dirname, 'public');
const GENERATED_MODEL_DIR = join(PUBLIC_DIR, 'models', 'generated');
const GENERATED_PREVIEW_DIR = join(PUBLIC_DIR, 'generated', 'library');
const DATA_DIR = join(__dirname, 'data');
const GENERATED_MODELS_FILE = join(DATA_DIR, 'generated-models.json');
const rawMaxSavedModels = Number(process.env.MAX_SAVED_MODELS || '0');
const MAX_SAVED_MODELS = Number.isFinite(rawMaxSavedModels) && rawMaxSavedModels > 0 ? Math.floor(rawMaxSavedModels) : 0;

if (!SECRET_ID || !SECRET_KEY) {
  console.error('\n[启动失败] 未配置 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY');
  process.exit(1);
}
if (!ARK_API_KEY) {
  console.error('\n[启动失败] 未配置 ARK_API_KEY');
  process.exit(1);
}

// ===== 腾讯云 API 3.0 签名(TC3-HMAC-SHA256)=====
function sha256Hex(msg) { return crypto.createHash('sha256').update(msg, 'utf8').digest('hex'); }
function hmacSha256(key, msg) { return crypto.createHmac('sha256', key).update(msg, 'utf8').digest(); }
function hmacSha256Hex(key, msg) { return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex'); }

async function callTencentAPI(service, host, version, action, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payloadStr = JSON.stringify(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedRequestPayload = sha256Hex(payloadStr);
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
  const algorithm = 'TC3-HMAC-SHA256';
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
  const secretDate = hmacSha256(('TC3' + SECRET_KEY), date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = hmacSha256Hex(secretSigning, stringToSign);
  const authorization = `${algorithm} Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  let resp;
  try {
    resp = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': version,
        'X-TC-Region': REGION,
      },
      body: payloadStr,
    });
  } catch (e) {
    throw new Error(`[腾讯云${action}] 网络请求失败: ${e.message || e}`);
  }
  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`[腾讯云${action}] 返回非 JSON(${resp.status}): ${text.slice(0, 300)}`);
  }
  if (!resp.ok) throw new Error(`[腾讯云${action}] HTTP ${resp.status}: ${text.slice(0, 300)}`);
  const response = json.Response;
  if (response?.Error) {
    const e = new Error(`[${response.Error.Code}] ${response.Error.Message}`);
    e.code = response.Error.Code;
    e.requestId = response.RequestId;
    throw e;
  }
  return response;
}

// 通用轮询:submit → 拿 JobId → 循环 query 直到 Status=DONE/FAIL
async function submitAndPoll(submitArgs, queryAction, { intervalMs = 5000, timeoutMs = 240000 } = {}) {
  const [service, host, version, submitAction, submitPayload] = submitArgs;
  const submitResp = await callTencentAPI(service, host, version, submitAction, submitPayload);
  const jobId = submitResp.JobId;
  if (!jobId) throw new Error(`提交任务失败: ${submitResp.Error?.Message || JSON.stringify(submitResp)}`);
  console.log(`  [submit] ${submitAction} JobId=${jobId}, 开始轮询...`);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, intervalMs));
    const q = await callTencentAPI(service, host, version, queryAction, { JobId: jobId });
    if (q.Status === 'DONE') {
      console.log(`  [poll] JobId=${jobId} DONE (${Math.round((Date.now() - start) / 1000)}s)`);
      return q;
    }
    if (q.Status === 'FAIL') {
      const e = new Error(`任务失败: ${q.ErrorMessage || ''}`);
      e.code = q.ErrorCode; e.detail = q;
      throw e;
    }
  }
  throw new Error(`任务超时(${timeoutMs / 1000}s),JobId=${jobId}`);
}

// ===== seedream 文生图/图生图/多图融合(火山引擎方舟)=====

async function fetchArkJson(body, label) {
  let resp;
  try {
    resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ARK_API_KEY}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`[${label}] seedream 网络请求失败: ${e.message || e}`);
  }

  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`[${label}] seedream 返回非 JSON(${resp.status}): ${text.slice(0, 300)}`);
  }

  if (!resp.ok || data.error) {
    const msg = data.error?.message || data.error || `HTTP ${resp.status}: ${text.slice(0, 300)}`;
    throw new Error(`[${label}] seedream 失败: ${msg}`);
  }
  return data;
}

// 文生图
async function generateImageBySeedream(prompt, seed) {
  const body = { model: ARK_MODEL, prompt, size: '2048x2048', response_format: 'url', watermark: false };
  if (seed !== undefined) body.seed = seed;
  const data = await fetchArkJson(body, '文生图');
  const url = data.data?.[0]?.url;
  if (!url) throw new Error('文生图未返回图片');
  return url;
}

// 单图图生图(基于参考图 + prompt 生成新图)
async function generateImageBySeedreamI2I(prompt, imageUrl, seed) {
  const body = {
    model: ARK_MODEL, prompt, image: imageUrl,
    sequential_image_generation: 'disabled',
    size: '2048x2048', response_format: 'url', watermark: false,
  };
  if (seed !== undefined) body.seed = seed;
  const data = await fetchArkJson(body, '图生图');
  const url = data.data?.[0]?.url;
  if (!url) throw new Error('图生图未返回图片');
  return url;
}

// 多图融合(2-14 张参考图 + prompt → 1 张融合图)
async function generateImageBySeedreamMulti(prompt, imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) throw new Error('多图融合至少需要 2 张图');
  const data = await fetchArkJson({
    model: ARK_MODEL,
    prompt,
    image: imageUrls,
    sequential_image_generation: 'disabled',
    size: '2048x2048',
    response_format: 'url',
    watermark: false,
  }, `多图融合 ${imageUrls.length} 张`);
  const url = data.data?.[0]?.url;
  if (!url) throw new Error('多图融合未返回图片');
  return url;
}

// ===== 混元3D 图生3D =====

// 输入:字符串URL(单图) 或 [{view, url}, ...](多视角,必须含 front)
// 优先 Pro 专业版,资源不足时 fallback 到 Rapid 极速版
async function imageTo3D(inputs) {
  const isMulti = Array.isArray(inputs);
  const buildPayload = () => {
    if (isMulti) {
      const front = inputs.find(v => v.view === 'front');
      if (!front) throw new Error('多视角输入必须包含 front 视角作为主图');
      const mv = inputs.filter(v => v.view !== 'front').map(v => ({ ViewType: v.view, ViewImageUrl: v.url }));
      return { ImageUrl: front.url, MultiViewImages: mv };
    }
    return { ImageUrl: inputs };
  };

  const variants = [
    { submit: 'SubmitHunyuanTo3DProJob', query: 'QueryHunyuanTo3DProJob', label: 'Pro专业版' },
    { submit: 'SubmitHunyuanTo3DRapidJob', query: 'QueryHunyuanTo3DRapidJob', label: 'Rapid极速版' },
  ];

  const isResourceInsufficient = (e) => {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    return code.includes('ResourceInsufficient') || message.includes('ResourceInsufficient') || message.includes('资源不足');
  };

  let lastErr;
  for (const v of variants) {
    try {
      const payload = buildPayload();
      console.log(`[图生3D] 尝试 ${v.label}:`, isMulti ? `多视角 x${inputs.length}` : '单图');
      const resp = await submitAndPoll(
        ['ai3d', 'ai3d.tencentcloudapi.com', '2025-05-13', v.submit, payload],
        v.query,
        { intervalMs: 5000, timeoutMs: isMulti ? 480000 : 240000 }
      );
      const files = resp.ResultFile3Ds || [];
      const glb = files.find(f => f.Type === 'GLB');
      if (!glb?.Url) throw new Error(`${v.label} 无 GLB 输出`);
      console.log(`[图生3D] ${v.label} 完成:`, glb.Url.slice(0, 80) + '...');
      return {
        glbUrl: glb.Url,
        previewUrl: glb.PreviewImageUrl || files[0]?.PreviewImageUrl,
        allFiles: files,
        version: v.label,
        inputMode: isMulti ? 'multiview' : 'single',
      };
    } catch (e) {
      console.warn(`[图生3D] ${v.label} 失败:`, e.message);
      lastErr = e;
      if (!isResourceInsufficient(e)) throw e;
    }
  }
  throw lastErr || new Error('图生3D 全部失败');
}

// ===== 路由 =====
async function ensureGeneratedModelStore() {
  await Promise.all([
    mkdir(GENERATED_MODEL_DIR, { recursive: true }),
    mkdir(GENERATED_PREVIEW_DIR, { recursive: true }),
    mkdir(DATA_DIR, { recursive: true }),
  ]);
}

function buildPublicPath(...segments) {
  return `/public/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function buildRequestOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function buildAbsoluteUrl(req, path) {
  if (!path) return '';
  return new URL(path, buildRequestOrigin(req)).toString();
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildGeneratedModelName(createdAt) {
  return `AI 面具 ${createdAt.slice(0, 16).replace('T', ' ')}`;
}

function resolvePreviewExtension(url, contentType = '') {
  const lowerType = String(contentType).toLowerCase();
  if (lowerType.includes('png')) return '.png';
  if (lowerType.includes('webp')) return '.webp';
  if (lowerType.includes('gif')) return '.gif';
  if (lowerType.includes('bmp')) return '.bmp';
  try {
    const ext = extname(new URL(url).pathname || '').toLowerCase();
    return ext && ext.length <= 5 ? ext : '.jpg';
  } catch {
    return '.jpg';
  }
}

async function fetchAssetBuffer(url, label) {
  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new Error(`[${label}] 下载失败: ${e.message || e}`);
  }
  if (!resp.ok) {
    throw new Error(`[${label}] 下载失败: HTTP ${resp.status}`);
  }
  return {
    buffer: Buffer.from(await resp.arrayBuffer()),
    contentType: resp.headers.get('content-type') || '',
  };
}

async function readGeneratedModels() {
  await ensureGeneratedModelStore();
  try {
    const text = await readFile(GENERATED_MODELS_FILE, 'utf8');
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeGeneratedModels(models) {
  await ensureGeneratedModelStore();
  await writeFile(GENERATED_MODELS_FILE, JSON.stringify(models, null, 2), 'utf8');
}

function serializeGeneratedModel(req, model) {
  return {
    ...model,
    glbUrl: buildAbsoluteUrl(req, model.glbPath),
    previewImageUrl: buildAbsoluteUrl(req, model.previewImagePath),
  };
}

async function persistGeneratedModel({ imageUrl, previewUrl, glbUrl, prompt, version, inputMode }) {
  await ensureGeneratedModelStore();

  const createdAt = new Date().toISOString();
  const id = `mask-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const glbAsset = await fetchAssetBuffer(glbUrl, 'GLB 模型');
  const glbFilename = `${id}.glb`;
  await writeFile(join(GENERATED_MODEL_DIR, glbFilename), glbAsset.buffer);

  let previewImagePath = '';
  const previewSource = imageUrl || previewUrl || '';
  if (previewSource) {
    try {
      const previewAsset = await fetchAssetBuffer(previewSource, '模型预览图');
      const previewExt = resolvePreviewExtension(previewSource, previewAsset.contentType);
      const previewFilename = `${id}${previewExt}`;
      await writeFile(join(GENERATED_PREVIEW_DIR, previewFilename), previewAsset.buffer);
      previewImagePath = buildPublicPath('generated', 'library', previewFilename);
    } catch (e) {
      console.warn('[generated-model] 预览图保存失败:', e.message || e);
    }
  }

  const savedModel = {
    id,
    name: buildGeneratedModelName(createdAt),
    glbPath: buildPublicPath('models', 'generated', glbFilename),
    previewImagePath,
    sizeBytes: glbAsset.buffer.length,
    sizeLabel: formatFileSize(glbAsset.buffer.length),
    source: 'AI 生成',
    createdAt,
    prompt: prompt || '',
    version: version || '',
    inputMode: inputMode || 'single',
  };

  const currentModels = await readGeneratedModels();
  const nextModels = [savedModel, ...currentModels];
  if (MAX_SAVED_MODELS > 0) nextModels.length = Math.min(nextModels.length, MAX_SAVED_MODELS);
  await writeGeneratedModels(nextModels);
  return savedModel;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 大点,因为可能传 base64 纹样图

const staticOptions = {
  dotfiles: 'ignore',
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.wasm')) res.type('application/wasm');
  },
};

app.use('/public', express.static(join(__dirname, 'public')));
app.use('/fragments', express.static(join(__dirname, 'fragments'), staticOptions));
app.use('/mediapipe-facemesh', express.static(join(__dirname, 'mediapipe-facemesh'), staticOptions));
app.use('/node_modules/@mediapipe/tasks-vision', express.static(join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision'), staticOptions));

app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

app.get('/ar-wear.html', (req, res) => {
  res.sendFile(join(__dirname, 'ar-wear.html'));
});

app.get('/:file', (req, res, next) => {
  const file = req.params.file;
  if (file !== basename(file) || !/\.(?:glb|gltf|bin|png|jpg|jpeg|webp|gif)$/i.test(file)) return next();
  res.sendFile(join(__dirname, file));
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, arkModel: ARK_MODEL, secretIdPrefix: SECRET_ID.slice(0, 8) });
});

app.get('/api/generated-models', async (req, res) => {
  try {
    const models = await readGeneratedModels();
    res.json({ models: models.map((model) => serializeGeneratedModel(req, model)) });
  } catch (e) {
    console.error('[generated-models] 閿欒:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 1. 多图融合:拼合面具图 + 纹样图 → 完整面具图
app.post('/api/repair-mask', async (req, res) => {
  try {
    const { maskImage, patternImage } = req.body || {};
    if (!maskImage || !patternImage) return res.status(400).json({ error: 'maskImage 和 patternImage 不能为空' });

    const prompt = '将图2的纹样融合到图1的面具上,保持面具造型,叠加纹样浮雕,青铜材质,三星堆古蜀风格,纯白背景,高细节,居中对称,3D渲染';
    console.log('[repair-mask] 调用 seedream 多图融合');
    const url = await generateImageBySeedreamMulti(prompt, [maskImage, patternImage]);
    console.log('[repair-mask] 完成:', url.slice(0, 80) + '...');
    res.json({ url, prompt });
  } catch (e) {
    console.error('[repair-mask] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 1.1 通用多图参考生成:碎片/材质/纹样/颜色等多张参考图 → 单张面具设计图
app.post('/api/generate-mask-image', async (req, res) => {
  try {
    const userPrompt = (req.body?.prompt || '').trim();
    const inputImages = Array.isArray(req.body?.imageUrls)
      ? req.body.imageUrls.map(v => String(v || '').trim()).filter(Boolean)
      : [];

    if (!userPrompt) return res.status(400).json({ error: 'prompt 不能为空' });
    if (inputImages.length < 2) return res.status(400).json({ error: 'imageUrls 至少需要 2 张参考图' });

    const imageUrls = inputImages.slice(0, 14);
    const prompt = `${userPrompt}

请综合所有参考图生成一张可用于图生3D的三星堆面具设计图: 保留面具正面轮廓、五官结构和耳翼比例, 融合所选材质、颜色和纹样为浮雕/蚀刻细节。输出必须是单一面具、正面视图、居中对称、纯白背景、无人物、无佩戴者、无文字、边缘清晰、适合后续单视角图生3D建模。`;

    console.log('[generate-mask-image] 多图参考生成单张面具图, images=', imageUrls.length);
    const url = await generateImageBySeedreamMulti(prompt, imageUrls);
    console.log('[generate-mask-image] 完成:', url.slice(0, 80) + '...');
    res.json({ imageUrl: url, url, prompt, inputCount: imageUrls.length, model: ARK_MODEL });
  } catch (e) {
    console.error('[generate-mask-image] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 2. 单图生四视角:完整面具图 → 正/左/右/后 四张图(同一 seed 保证造型一致)
app.post('/api/multiview-from-image', async (req, res) => {
  try {
    const imageUrl = (req.body?.imageUrl || '').trim();
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl 不能为空' });

    const baseStyle = '青铜面具,三星堆古蜀风格,纯白背景,高细节,居中对称,单一面具,3D渲染';
    const seed = Math.floor(Math.random() * 1000000);
    const viewDefs = [
      { key: 'front', prompt: `${baseStyle}, 正面视图, 正视图` },
      { key: 'left',  prompt: `${baseStyle}, 左侧视图, 左侧面具, 侧面朝左` },
      { key: 'right', prompt: `${baseStyle}, 右侧视图, 右侧面具, 侧面朝右` },
      { key: 'back',  prompt: `${baseStyle}, 后视图, 背面视图, 面具背面` },
    ];

    console.log('[multiview] 以参考图生成四视角, seed=', seed);
    const views = await Promise.all(viewDefs.map(async (v) => {
      const url = await generateImageBySeedreamI2I(v.prompt, imageUrl, seed);
      return { view: v.key, url };
    }));
    console.log('[multiview] 四视角全部完成');
    res.json({ views, seed });
  } catch (e) {
    console.error('[multiview] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 3. 单图图生3D
app.post('/api/image-to-3d', async (req, res) => {
  try {
    const imageUrl = (req.body?.imageUrl || '').trim();
    const prompt = (req.body?.prompt || '').trim();
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl 不能为空' });
    const result = await imageTo3D(imageUrl);
    const savedModel = await persistGeneratedModel({
      imageUrl,
      previewUrl: result.previewUrl,
      glbUrl: result.glbUrl,
      prompt,
      version: result.version,
      inputMode: result.inputMode,
    });
    const serializedModel = serializeGeneratedModel(req, savedModel);
    res.json({
      ...result,
      glbUrl: serializedModel.glbUrl,
      previewImageUrl: serializedModel.previewImageUrl,
      savedModel: serializedModel,
    });
  } catch (e) {
    console.error('[image-to-3d] 错误:', e.message);
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// 4. 多视角图生3D(禁用):当前系统固定使用单视角 /api/image-to-3d
app.post('/api/image-to-3d-multi', async (req, res) => {
  res.status(400).json({ error: '当前系统固定使用单视角图生3D,请调用 /api/image-to-3d' });
});

// 5. 旧一站式多视角流程(禁用):当前系统固定为多图生成单图 → 单视角图生3D
app.post('/api/generate-full-mask', async (req, res) => {
  res.status(400).json({ error: '当前系统固定为多图生成单张面具图后单视角建模,请调用 /api/generate-mask-image 和 /api/image-to-3d' });
});

await ensureGeneratedModelStore();

app.listen(PORT, () => {
  console.log(`\n[三星堆考古体验后端] http://127.0.0.1:${PORT}`);
  console.log(`  腾讯云区域: ${REGION}  SecretId: ${SECRET_ID.slice(0, 8)}...${SECRET_ID.slice(-4)}`);
  console.log(`  seedream 模型: ${ARK_MODEL}`);
  console.log(`  健康检查: GET /api/health\n`);
});
