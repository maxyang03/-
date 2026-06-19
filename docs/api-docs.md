# API 集成文档 (API Docs)

## 概述

本项目使用三组外部 AI 服务，所有调用从浏览器直发。

---

## 1. DeepSeek — 翻译 + 拼音

### 基本信息
- **Endpoint**：`https://api.deepseek.com/chat/completions`
- **认证方式**：Bearer Token（API Key）
- **兼容性**：OpenAI Chat Completions 格式
- **文档**：https://platform.deepseek.com/api-docs

### 请求格式

```typescript
const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: `你是一个粤语翻译专家。将用户输入的普通话翻译成地道粤语口语，
并为每句粤语标注粵拼（Jyutping）。严格按以下 JSON 格式输出，
不要输出任何其他内容：
[{"yue": "粤语句子", "jyutping": "jyut6 ping3"}]`
      },
      {
        role: 'user',
        content: `请翻译以下普通话句子：\n${mandarinSentences.join('\n')}`
      }
    ],
    temperature: 0.3,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  }),
});
```

### 响应解析

```typescript
interface DeepSeekResponse {
  choices: Array<{
    message: {
      content: string; // JSON 字符串
    };
  }>;
}

// content 解析为：
type TranslationResult = Array<{ yue: string; jyutping: string }>;
```

### 测试连接

发一条简单消息，检查 HTTP 200 即可：

```typescript
const response = await fetch('https://api.deepseek.com/v1/models', {
  headers: { 'Authorization': `Bearer ${apiKey}` },
});
// 200 = 连接成功，401 = Key 无效
```

### 注意事项
- 每月免费额度有限
- JSON 输出偶尔不合法，需要 parse 容错（尝试 JSON.parse，失败则正则提取）
- 批量翻译建议每批不超过 20 句

---

## 2. 腾讯云 ASR — 语音识别

### 基本信息
- **Endpoint**：`https://asr.tencentcloudapi.com/`
- **认证方式**：腾讯云 API 3.0 签名（HMAC-SHA1）
- **接口**：CreateRecTask（录音文件识别）
- **文档**：https://cloud.tencent.com/document/api/1093/37823

### 签名算法（V3）

```typescript
// 1. 构造规范请求串
const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
const signedHeaders = 'content-type;host';
const payloadHash = sha256(JSON.stringify(body));
const canonicalRequest = [
  'POST',
  '/',
  '',
  canonicalHeaders,
  signedHeaders,
  payloadHash,
].join('\n');

// 2. 拼接待签名字符串
const algorithm = 'TC3-HMAC-SHA256';
const timestamp = Math.floor(Date.now() / 1000);
const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
const credentialScope = `${date}/${service}/tc3_request`;
const hashedCanonicalRequest = sha256(canonicalRequest);
const stringToSign = [
  algorithm,
  timestamp,
  credentialScope,
  hashedCanonicalRequest,
].join('\n');

// 3. 计算签名
const secretDate = hmacSha256(`TC3${secretKey}`, date);
const secretService = hmacSha256(secretDate, service);
const secretSigning = hmacSha256(secretService, 'tc3_request');
const signature = hmacSha256Hex(secretSigning, stringToSign);

// 4. 拼装 Authorization
const authorization = [
  `${algorithm} Credential=${secretId}/${credentialScope}`,
  `SignedHeaders=${signedHeaders}`,
  `Signature=${signature}`,
].join(', ');
```

### 请求格式

```typescript
const body = {
  EngineModelType: '16k_zh',       // 中文普通话 16k
  ChannelNum: 1,
  ResTextFormat: 3,                 // 含时间戳
  SourceType: 1,                    // 音频 URL（需先上传）
  Data: base64Audio,                // 或 base64 编码音频
  DataLen: audioByteLength,
};
```

### 轮询获取结果

录音文件识别是异步的，需要轮询：

```typescript
// 1. 创建识别任务
const { Data: { TaskId } } = await createRecTask(audioData);

// 2. 轮询结果（最长 2 分钟，间隔 2 秒）
let result = null;
for (let i = 0; i < 60; i++) {
  await sleep(2000);
  const { Data } = await describeTaskStatus(TaskId);
  if (Data.StatusStr === 'success') {
    result = Data.ResultDetail;
    break;
  }
  if (Data.StatusStr === 'failed') {
    throw new Error(Data.ErrorMsg);
  }
}
```

### 响应解析

```typescript
interface ASRResult {
  ResultDetail: Array<{
    FinalSentence: string;
    SliceSentence: string;
    StartMs: number;
    EndMs: number;
    SpeechSpeed: number;
  }>;
}

// 转换为内部格式
function parseASRResult(result: ASRResult): SubtitleSegment[] {
  return result.ResultDetail.map(item => ({
    start: item.StartMs / 1000,
    end: item.EndMs / 1000,
    text: item.FinalSentence,
  }));
}
```

### 测试连接

发一个空的 DescribeTaskStatus 请求，检查签名是否通过（返回权限错误而非签名错误即可视为连接成功）。

---

## 3. Azure TTS — 粤语朗读

### 基本信息
- **Endpoint**：`https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`
- **认证方式**：Ocp-Apim-Subscription-Key header
- **接口**：REST API（SSML → audio/mpeg）
- **文档**：https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech

### 请求格式

```typescript
const ssml = `
<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-HK'>
  <voice name='zh-HK-HiuMaanNeural'>
    ${yueText}
  </voice>
</speak>`;

const response = await fetch(
  `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
  {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': subscriptionKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    },
    body: ssml,
  }
);

// 返回 audio/mpeg blob
const audioBlob = await response.blob();
```

### 可用粤语语音

| 语音 ID | 名称 | 风格 |
|---------|------|------|
| zh-HK-HiuMaanNeural | 晓曼 | 女声，标准 |
| zh-HK-HiuGaaiNeural | 晓佳 | 女声，标准 |
| zh-HK-WanLungNeural | 云龙 | 男声，标准 |

### 测试连接

发一个最简单的 SSML（单个字），检查返回：

```typescript
const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-HK'><voice name='zh-HK-HiuMaanNeural'>你好</voice></speak>`;
// 200 + audio/mpeg = 成功
// 401 = Key 无效
// 400 = SSML 格式错误
```

### 注意事项
- 逐句请求时注意并发限制（建议不超过 5 个并发）
- 生成音频缓存到 IndexedDB，key = sha256(yueText)
- 整段播放：拼接音频 blob 时在句子间插入 300ms 静音
