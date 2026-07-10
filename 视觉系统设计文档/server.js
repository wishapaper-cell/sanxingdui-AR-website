// 混元3D 面具生成后端代理
// 流程:文字 → 混元生图(三视图设计稿) → 混元3D 图生3D → GLB
// 异步接口:submit 拿 JobId → 轮询 query 直到 Status=DONE/FAIL
//
// 配置(.env):
//   TENCENTCLOUD_SECRET_ID=AKIDxxxxxxxxxx
//   TENCENTCLOUD_SECRET_KEY=xxxxxxxxxx
//   PORT=3001
//
// 注意:用户提供的 sk-b0tt... 格式不像腾讯云官方 SecretId/SecretKey(官方是 AKID 开头 + 32 位 SecretKey)。
// 若该 key 来自第三方 OpenAI 兼容代理,需改用代理 base URL,本服务默认按腾讯云官方签名调用。
// 正确的密钥获取:https://console.cloud.tencent.com/cam/capi

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Credential } from 'tencentcloud-sdk-nodejs/es/common/credential';
import { Client as Ai3dClient } from 'tencentcloud-sdk-nodejs/es/services/ai3d/v20250513/ai3d_client';
import { Client as HunyuanClient } from 'tencentcloud-sdk-nodejs/es/services/hunyuan/v20230901/hunyuan_client';

dotenv.config();

const SECRET_ID = process.env.TENCENTCLOUD_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENTCLOUD_SECRET_KEY || '';
const REGION = process.env.TENCENTCLOUD_REGION || 'ap-guangzhou';
const PORT = process.env.PORT || 3001;

if (!SECRET_ID || !SECRET_KEY) {
  console.error('\n[启动失败] 未配置 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY');
  console.error('  请到 https://console.cloud.tencent.com/cam/capi 创建密钥,复制到 .env\n');
  process.exit(1);
}

// 构造认证和客户端(endpoint 已由各 Client 构造函数内置,profile 用 plain object 即可)
const cred = new Credential(SECRET_ID, SECRET_KEY);
const ai3dClient = new Ai3dClient({ credential: cred, region: REGION });
const hunyuanClient = new HunyuanClient({ credential: cred, region: REGION });

// 通用轮询:submit → 拿 JobId → 循环 query 直到 Status=DONE/FAIL
async function submitAndPoll(submitFn, submitReq, queryFn, { intervalMs = 3000, timeoutMs = 180000 } = {}) {
  const submitResp = await submitFn(submitReq);
  const jobId = submitResp.JobId;
  if (!jobId) {
    const err = submitResp.Error || submitResp.Response?.Error;
    throw new Error(`提交任务失败: ${err?.Message || JSON.stringify(submitResp)}`);
  }
  console.log(`  [submit] JobId=${jobId}, 开始轮询...`);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, intervalMs));
    const q = await queryFn({ JobId: jobId });
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

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, secretIdPrefix: SECRET_ID.slice(0, 8) });
});

// 文生图:文字 → 混元生图 → 面具三视图设计稿
app.post('/api/text-to-image', async (req, res) => {
  try {
    const userPrompt = (req.body?.prompt || '').trim();
    if (!userPrompt) return res.status(400).json({ error: 'prompt 不能为空' });

    // 三视图 prompt 模板:强制白底 + 三视图布局 + 青铜面具风格
    const prompt = `${userPrompt}, 面具, 三视图设计稿, 正视图 侧视图 俯视图, 青铜材质, 三星堆古蜀风格, 纯白背景, 高细节, 居中对称, 概念设计图`;
    console.log('[文生图] 提交:', prompt);

    const resp = await submitAndPoll(
      (r) => hunyuanClient.SubmitHunyuanImageJob(r),
      { Prompt: prompt },
      (r) => hunyuanClient.QueryHunyuanImageJob(r),
      { intervalMs: 2000, timeoutMs: 60000 }
    );
    // 混元生图返回:Response.Images[0].Url 或 Response.ResultImage
    const imgUrl = resp.Images?.[0]?.Url || resp.ResultImage || resp.ImageUrl;
    if (!imgUrl) {
      console.error('[文生图] 返回结构异常:', JSON.stringify(resp));
      return res.status(500).json({ error: '生图成功但未取到图片 URL', detail: resp });
    }
    console.log('[文生图] 完成:', imgUrl);
    res.json({ url: imgUrl, prompt });
  } catch (e) {
    console.error('[文生图] 错误:', e.message);
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// 图生3D:图片 URL → 混元3D → GLB
app.post('/api/image-to-3d', async (req, res) => {
  try {
    const imageUrl = (req.body?.imageUrl || '').trim();
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl 不能为空' });

    console.log('[图生3D] 提交:', imageUrl);
    const resp = await submitAndPoll(
      (r) => ai3dClient.SubmitHunyuanTo3DProJob(r),
      { ImageUrl: imageUrl },
      (r) => ai3dClient.QueryHunyuanTo3DProJob(r),
      { intervalMs: 3000, timeoutMs: 240000 } // 3D 生成较慢,给 4 分钟
    );

    // ResultFile3Ds 数组,挑 GLB
    const files = resp.ResultFile3Ds || [];
    const glb = files.find(f => f.Type === 'GLB');
    const obj = files.find(f => f.Type === 'OBJ');
    const result = {
      glbUrl: glb?.Url,
      objUrl: obj?.Url,
      previewUrl: glb?.PreviewImageUrl || files[0]?.PreviewImageUrl,
      allFiles: files,
    };
    if (!result.glbUrl) {
      console.error('[图生3D] 无 GLB 输出:', JSON.stringify(resp));
      return res.status(500).json({ error: '3D 生成成功但无 GLB 输出', detail: resp });
    }
    console.log('[图生3D] 完成:', result.glbUrl);
    res.json(result);
  } catch (e) {
    console.error('[图生3D] 错误:', e.message);
    res.status(500).json({ error: e.message, code: e.code });
  }
});

// 一站式:文字 → 图 → 3D(单次请求,内部串行)
app.post('/api/generate-mask', async (req, res) => {
  try {
    const userPrompt = (req.body?.prompt || '').trim();
    if (!userPrompt) return res.status(400).json({ error: 'prompt 不能为空' });

    const prompt = `${userPrompt}, 面具, 三视图设计稿, 正视图 侧视图 俯视图, 青铜材质, 三星堆古蜀风格, 纯白背景, 高细节, 居中对称, 概念设计图`;
    console.log('[一站式] 文生图提交:', prompt);
    const imgResp = await submitAndPoll(
      (r) => hunyuanClient.SubmitHunyuanImageJob(r),
      { Prompt: prompt },
      (r) => hunyuanClient.QueryHunyuanImageJob(r),
      { intervalMs: 2000, timeoutMs: 60000 }
    );
    const imageUrl = imgResp.Images?.[0]?.Url || imgResp.ResultImage || imgResp.ImageUrl;
    if (!imageUrl) return res.status(500).json({ error: '生图未取到 URL', detail: imgResp });
    console.log('[一站式] 文生图完成:', imageUrl);

    console.log('[一站式] 图生3D 提交');
    const d3Resp = await submitAndPoll(
      (r) => ai3dClient.SubmitHunyuanTo3DProJob(r),
      { ImageUrl: imageUrl },
      (r) => ai3dClient.QueryHunyuanTo3DProJob(r),
      { intervalMs: 3000, timeoutMs: 240000 }
    );
    const files = d3Resp.ResultFile3Ds || [];
    const glb = files.find(f => f.Type === 'GLB');
    console.log('[一站式] 完成:', glb?.Url);
    res.json({
      previewUrl: imageUrl,
      glbUrl: glb?.Url,
      allFiles: files,
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
