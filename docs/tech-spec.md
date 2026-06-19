# 技术选型说明 (Tech Spec)

## 总体架构

```
iPhone Safari / PWA
    │
    ▼
┌─────────────────────────────────────┐
│  浏览器端 (React SPA)               │
│                                      │
│  ┌──────────┐ ┌──────────┐          │
│  │ ffmpeg   │ │ IndexedDB │          │
│  │ .wasm    │ │ (Dexie)  │          │
│  └──────────┘ └──────────┘          │
│       │                              │
│       ▼                              │
│  ┌──────────────────────────┐       │
│  │  浏览器 JS 直调各 API     │       │
│  │  - 腾讯云 ASR            │       │
│  │  - DeepSeek Chat API     │       │
│  │  - Azure TTS REST API    │       │
│  └──────────────────────────┘       │
└─────────────────────────────────────┘
```

无后端服务器 — 所有处理在浏览器端完成，API 调用直接从前端发往各服务商。

## 前端技术栈

| 层 | 选型 | 版本 | 理由 |
|---|------|------|------|
| 框架 | React | ^19 | 生态丰富，Hooks 适合复杂交互 |
| 语言 | TypeScript | ~6.0 | 类型安全 |
| 构建 | Vite | ^8.0 | 快速 HMR |
| 样式 | Tailwind CSS | ^4.3 | 原子化 CSS + @tailwindcss/vite 插件 |
| 路由 | react-router-dom | ^7.18 | 声明式路由 |
| 状态管理 | zustand | ^5.0 | 轻量，无 boilerplate |
| 数据库 | Dexie.js | ^4.4 | IndexedDB 封装 |
| PWA | vite-plugin-pwa | ^1.3 | Service Worker + manifest 自动化 |
| 音视频 | @ffmpeg/ffmpeg | ^0.12 | 浏览器端音视频处理 |

## AI 服务选型

### 1. 语音识别 — 腾讯云 ASR

- **接口**：录音文件识别（异步：上传 → 轮询 → 获取结果）
- **支持语言**：中文普通话（zh）- 16k 采样率
- **输出**：带 start_time / end_time / text 的句子列表
- **签名**：HMAC-SHA1 + Base64（腾讯云 API 3.0 签名规范）
- **限制**：一句话识别 < 5MB；录音文件识别支持更大文件，异步轮询最长 2 分钟

### 2. 翻译 + 拼音 — DeepSeek

- **接口**：Chat Completions API（OpenAI 兼容格式）
- **模型**：deepseek-chat
- **用法**：system prompt 约束输出 `[{"yue": "...", "jyutping": "..."}]` JSON 格式
- **特点**：国产模型，普通话→粤语翻译质量好，价格便宜

### 3. 粤语 TTS — 微软 Azure Cognitive Services

- **接口**：Text-to-Speech REST API
- **语音**：zh-HK-HiuMaanNeural / zh-HK-HiuGaaiNeural（粤语神经网络语音）
- **格式**：SSML 输入，返回 audio/mpeg
- **限制**：每月免费额度 50 万字符

## 浏览器兼容性

| 功能 | iOS Safari | Chrome | 备注 |
|------|-----------|--------|------|
| PWA standalone | ✅ 支持 | ✅ 支持 | iOS 17.4+ |
| IndexedDB | ✅ | ✅ | |
| Web Crypto API | ✅ | ✅ | |
| ffmpeg.wasm | ✅ (16.4+) | ✅ | 需 SharedArrayBuffer |
| `<input type="file" accept="video/*">` | ✅ | ✅ | iOS 限制内存 |
| AudioContext | ✅ | ✅ | 需用户手势触发 |

## 关键限制

1. **iOS Safari 无法捕获系统音频**：在线视频的 ASR 只能通过麦克风收音（质量差）
2. **ffmpeg.wasm 内存限制**：iOS Safari 对单个 tab 内存限制约 1-2GB，超大视频可能 OOM
3. **API Key 安全性**：浏览器直调意味着 Key 在前端，存在被提取风险。通过 Web Crypto 加密存储 + 用户自行管理 Key 缓解
4. **CORS 跨域**：部分 API 可能需要后端代理或特定 headers 支持浏览器直调
