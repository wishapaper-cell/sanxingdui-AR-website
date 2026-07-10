// 面具生成后端代理(seedream 文生图 + 腾讯云混元3D 图生3D)
// 流程:文字 → seedream 生图(三视图设计稿) → 混元3D 图生3D → GLB
// 异步接口:submit 拿 JobId → 轮询 query 直到 Status=DONE/FAIL
//
// 配置(.env,与本文件同目录):
//   TENCENTCLOUD_SECRET_ID=AKIDxxxxxxxxxx
//   TENCENTCLOUD_SECRET_KEY=xxxxxxxxxx
//   PORT=3001
//
// 密钥获取:https://console.cloud.tencent.com/cam/capi
// 官方 SecretId 以 AKID 开头,SecretKey 是 32 位字符串。
// 若你拿到的是 sk- 开头的 key,可能是第三方代理,不能直接用于腾讯云官方签名。

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const SECRET_ID = process.env.TENCENTCLOUD_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENTCLOUD_SECRET_KEY || '';
const REGION = process.env.TENCENTCLOUD_REGION || 'ap-guangzhou';
const PORT = process.env.PORT || 3001;

// 火山引擎方舟 API(seedream 文生图)
// 文档:https://www.volcengine.com/docs/82379/1541523
const ARK_API_KEY = process.env.ARK_API_KEY || '';
const ARK_MODEL = process.env.ARK_SEEDREAM_MODEL || 'doubao-seedream-4-0-250828';

if (!SECRET_ID || !SECRET_KEY) {
  console.error('\n[启动失败] 未配置 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY');
  console.error('  请到 https://console.cloud.tencent.com/cam/capi 创建密钥,复制到 .env\n');
  process.exit(1);
}

// ===== 腾讯云 API 3.0 签名(TC3-HMAC-SHA256)=====
// 文档:https://cloud.tencent.com/document/api/213/30654
function sha256Hex(msg) {
  return crypto.createHash('sha256').update(msg, 'utf8').digest('hex');
}
function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}
function hmacSha256Hex(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex');
}

/**
 * 调用腾讯云 API
 * @param {string} service - 服务名,如 ai3d / hunyuan
 * @param {string} host - 域名,如 ai3d.tencentcloudapi.com
 * @param {string} version - API 版本,如 2025-05-13
 * @param {string} action - 接口名,如 SubmitHunyuanTo3DProJob
 * @param {object} payload - 请求参数对象
 */
async function callTencentAPI(service, host, version, action, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const payloadStr = JSON.stringify(payload);

  // 1. 拼接规范请求串 CanonicalRequest
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedRequestPayload = sha256Hex(payloadStr);
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

  // 2. 拼接签名串 StringToSign
  const algorithm = 'TC3-HMAC-SHA256';
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

  // 3. 计算签名 Signature
  const secretDate = hmacSha256(('TC3' + SECRET_KEY), date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = hmacSha256Hex(secretSigning, stringToSign);

  // 4. 拼接 Authorization
  const authorization = `${algorithm} Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // 发请求
  const headers = {
    'Authorization': authorization,
    'Content-Type': 'application/json; charset=utf-8',
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
    'X-TC-Region': REGION,
  };

  const resp = await fetch(`https://${host}`, {
    method: 'POST',
    headers,
    body: payloadStr,
  });
  const json = await resp.json();
  const response = json.Response;
  // 腾讯云错误响应:Response.Error.Code + Response.Error.Message
  if (response?.Error) {
    const e = new Error(`[${response.Error.Code}] ${response.Error.Message}`);
    e.code = response.Error.Code;
    e.requestId = response.RequestId;
    throw e;
  }
  return response;
}

// 通用轮询:submit → 拿 JobId → 循环 query 直到 Status=DONE/FAIL
// submitArgs: [service, host, version, action, payload]
// queryAction: 查询接口名,如 'QueryHunyuanImageJob'
async function submitAndPoll(submitArgs, queryAction, { intervalMs = 3000, timeoutMs = 180000 } = {}) {
  const [service, host, version, submitAction, submitPayload] = submitArgs;
  const submitResp = await callTencentAPI(service, host, version, submitAction, submitPayload);
  const jobId = submitResp.JobId;
  if (!jobId) {
    const err = submitResp.Error;
    throw new Error(`提交任务失败: ${err?.Message || JSON.stringify(submitResp)}`);
  }
  console.log(`  [submit] ${submitAction} JobId=${jobId}, 开始轮询...`);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, intervalMs));
    const q = await callTencentAPI(service, host, version, queryAction, { JobId: jobId });
    const status = q.Status;
    if (status === 'DONE') {
      console.log(`  [poll] JobId=${jobId} DONE (${Math.round((Date.now() - start) / 1000)}s)`);
      return q;
    }
    if (status === 'FAIL') {
      const e = new Error(`任务失败: ${q.ErrorMessage || ''}`);
      e.code = q.ErrorCode;
      e.detail = q;
      throw e;
    }
    // WAIT/RUN 继续轮询
  }
  throw new Error(`任务超时(${timeoutMs / 1000}s),JobId=${jobId}`);
}

// ===== 路由 =====
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, secretIdPrefix: SECRET_ID.slice(0, 8), arkModel: ARK_MODEL });
});

// seedream 文生图(火山引擎方舟) → 返回图片 URL(24小时有效)
// 文档:https://www.volcengine.com/docs/82379/1541523
async function generateImageBySeedream(prompt) {
  if (!ARK_API_KEY) throw new Error('未配置 ARK_API_KEY(请检查 .env)');
  console.log('[文生图] 调用 seedream:', ARK_MODEL, '| prompt:', prompt.slice(0, 60) + '...');

  const resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      prompt,
      size: '2048x2048',
      response_format: 'url',
      watermark: false,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    const msg = data.error?.message || `HTTP ${resp.status}`;
    console.error('[文生图] seedream 错误:', msg);
    throw new Error(msg);
  }
  const imgUrl = data.data?.[0]?.url;
  if (!imgUrl) {
    console.error('[文生图] 返回结构异常:', JSON.stringify(data));
    throw new Error('生图成功但未取到图片 URL');
  }
  console.log('[文生图] 完成:', imgUrl.slice(0, 80) + '...');
  return imgUrl;
}

// 多视角生图:用同一描述 + 相同 seed,生成 front(主图) + left / right / back 四个视角
// 混元3D 的 MultiViewImages 是辅助输入,必须配合 ImageUrl(主图)使用
// ViewType 只支持 back / left / right
async function generateMultiViewImages(userPrompt) {
  const baseStyle = '青铜面具, 三星堆古蜀风格, 纯白背景, 高细节, 居中对称, 单一面具, 概念设计图, 3D 渲染';
  const views = [
    { key: 'front', prompt: `${userPrompt}, ${baseStyle}, 正面视图, 正面面具, 正视图` },
    { key: 'left',  prompt: `${userPrompt}, ${baseStyle}, 左侧视图, 左侧面具, 侧面朝左` },
    { key: 'right', prompt: `${userPrompt}, ${baseStyle}, 右侧视图, 右侧面具, 侧面朝右` },
    { key: 'back',  prompt: `${userPrompt}, ${baseStyle}, 后视图, 背面视图, 面具背面` },
  ];
  const seed = Math.floor(Math.random() * 1000000);

  console.log(`[多视角] 生成 4 个视角(front/left/right/back),seed=${seed}`);
  const results = await Promise.all(views.map(async (v) => {
    const url = await generateImageBySeedreamWithSeed(v.prompt, seed);
    return { view: v.key, url };
  }));
  return results;
}

// 带 seed 的生图(保证多视角造型一致)
async function generateImageBySeedreamWithSeed(prompt, seed) {
  if (!ARK_API_KEY) throw new Error('未配置 ARK_API_KEY(请检查 .env)');

  const resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      prompt,
      size: '2048x2048',
      response_format: 'url',
      watermark: false,
      seed,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    const msg = data.error?.message || `HTTP ${resp.status}`;
    throw new Error(`seedream 生图失败(${prompt.slice(0, 30)}): ${msg}`);
  }
  const imgUrl = data.data?.[0]?.url;
  if (!imgUrl) throw new Error('生图成功但未取到图片 URL');
  return imgUrl;
}

// 文生图路由:文字 → seedream → 单张面具正面图URL
app.post('/api/text-to-image', async (req, res) => {
  try {
    const userPrompt = (req.body?.prompt || '').trim();
    if (!userPrompt) return res.status(400).json({ error: 'prompt 不能为空' });
    const prompt = `${userPrompt}, 青铜面具正面图, 正面视角, 居中对称, 青铜材质, 三星堆古蜀风格, 纯白背景, 高细节, 单一面具, 概念设计图`;
    const url = await generateImageBySeedream(prompt);
    res.json({ url, prompt, model: ARK_MODEL });
  } catch (e) {
    console.error('[文生图] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 多视角生图路由:文字 → seedream × 3 → left/right/back 三张图URL
app.post('/api/text-to-image-multi', async (req, res) => {
  try {
    const userPrompt = (req.body?.prompt || '').trim();
    if (!userPrompt) return res.status(400).json({ error: 'prompt 不能为空' });
    const views = await generateMultiViewImages(userPrompt);
    res.json({ views, model: ARK_MODEL });
  } catch (e) {
    console.error('[多视角生图] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 图生3D:支持单图(ImageUrl)或多视角(MultiViewImages)
// inputs:字符串URL(单图) 或 [{view, url}, ...](多视角)
// 优先用 Pro 专业版,资源不足时 fallback 到 Rapid 极速版
// 多视角需要 3.1 版本(top/bottom/left_front/right_front 也要 3.1)
async function imageTo3D(inputs) {
  // 构造 payload
  // inputs:字符串URL(单图) 或 [{view, url}, ...](多视角,必须含 front 作为主图)
  const isMulti = Array.isArray(inputs);
  const buildPayload = (model) => {
    if (isMulti) {
      // 主图用 ImageUrl(front),其余用 MultiViewImages(back/left/right)
      const front = inputs.find(v => v.view === 'front');
      if (!front) throw new Error('多视角输入必须包含 front 视角作为主图');
      const mv = inputs
        .filter(v => v.view !== 'front')
        .map(v => ({ ViewType: v.view, ViewImageUrl: v.url }));
      return { Model: model, ImageUrl: front.url, MultiViewImages: mv };
    }
    return { Model: model, ImageUrl: inputs };
  };

  const variants = [
    { submit: 'SubmitHunyuanTo3DProJob', query: 'QueryHunyuanTo3DProJob', label: 'Pro专业版' },
    { submit: 'SubmitHunyuanTo3DRapidJob', query: 'QueryHunyuanTo3DRapidJob', label: 'Rapid极速版' },
  ];

  let lastErr;
  for (const v of variants) {
    try {
      const payload = buildPayload('3.1'); // 多视角必须用 3.1
      console.log(`[图生3D] 尝试 ${v.label} (3.1):`, isMulti ? `多视角 x${inputs.length}` : '单图');
      const resp = await submitAndPoll(
        ['ai3d', 'ai3d.tencentcloudapi.com', '2025-05-13', v.submit, payload],
        v.query,
        // 多视角融合比单图慢,超时放宽到 8 分钟
        { intervalMs: 5000, timeoutMs: isMulti ? 480000 : 240000 }
      );
      const files = resp.ResultFile3Ds || [];
      const glb = files.find(f => f.Type === 'GLB');
      const obj = files.find(f => f.Type === 'OBJ');
      const result = {
        glbUrl: glb?.Url,
        objUrl: obj?.Url,
        previewUrl: glb?.PreviewImageUrl || files[0]?.PreviewImageUrl,
        allFiles: files,
        version: v.label,
        inputMode: isMulti ? 'multiview' : 'single',
      };
      if (!result.glbUrl) {
        throw new Error(`${v.label} 生成成功但无 GLB 输出: ${JSON.stringify(resp).slice(0, 300)}`);
      }
      console.log(`[图生3D] ${v.label} 完成:`, result.glbUrl.slice(0, 80) + '...');
      return result;
    } catch (e) {
      console.warn(`[图生3D] ${v.label} 失败:`, e.message);
      lastErr = e;
      if (e.code !== 'ResourceInsufficient') throw e;
    }
  }
  throw lastErr || new Error('图生3D 全部失败');
}

// 单图图生3D 路由(向后兼容)
app.post('/api/image-to-3d', async (req, res) => {
  try {
    const imageUrl = (req.body?.imageUrl || '').trim();
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl 不能为空' });
    const result = await imageTo3D(imageUrl);
    res.json(result);
  } catch (e) {
    console.error('[图生3D] 错误:', e.message);
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// 多视角图生3D 路由:接收 views 数组
app.post('/api/image-to-3d-multi', async (req, res) => {
  try {
    const views = req.body?.views;
    if (!Array.isArray(views) || views.length === 0) {
      return res.status(400).json({ error: 'views 不能为空,需为 [{view, url}, ...]' });
    }
    const result = await imageTo3D(views);
    res.json(result);
  } catch (e) {
    console.error('[多视角图生3D] 错误:', e.message);
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// 一站式:文字 → seedream 多视角生图 → 混元3D 多视角生3D → GLB(一个模型)
app.post('/api/generate-mask', async (req, res) => {
  try {
    const userPrompt = (req.body?.prompt || '').trim();
    if (!userPrompt) return res.status(400).json({ error: 'prompt 不能为空' });

    console.log('[一站式] 步骤1:seedream 多视角生图(front/left/right/back)');
    const views = await generateMultiViewImages(userPrompt);
    console.log('[一站式] 4 个视角生图完成');

    console.log('[一站式] 步骤2:混元3D 多视角图生3D(3.1)');
    const d3Result = await imageTo3D(views);
    console.log('[一站式] 完成:', d3Result.glbUrl);
    res.json({
      previewUrl: views[0]?.url, // 第一个视角作为预览
      views,                      // 所有视角图
      glbUrl: d3Result.glbUrl,
      allFiles: d3Result.allFiles,
      version: d3Result.version,
      inputMode: d3Result.inputMode,
    });
  } catch (e) {
    console.error('[一站式] 错误:', e.message);
    res.status(500).json({ error: e.message, code: e.code });
  }
});

app.listen(PORT, () => {
  console.log(`\n[混元3D 面具生成后端] http://127.0.0.1:${PORT}`);
  console.log(`  区域: ${REGION}`);
  console.log(`  SecretId: ${SECRET_ID.slice(0, 8)}...${SECRET_ID.slice(-4)}`);
  console.log(`  健康检查: GET /api/health\n`);
});
