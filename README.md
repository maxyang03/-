# 粤语学习助手 (Cantonese Learner)

iPhone PWA 应用，用于通过普通话视频学习粤语。

## 功能

1. 导入本地视频或粘贴在线链接（B站、YouTube 等）
2. ffmpeg.wasm 提取音频
3. 腾讯云 ASR 语音识别（普通话 → 文字 + 时间戳）
4. DeepSeek AI 翻译（普通话 → 粤语 + 粵拼）
5. Azure TTS 粤语朗读（整段 / 逐句 + 速度调节）
6. 字幕同步高亮 + 自动滚动
7. 学习记录保存

## 技术栈

- React 19 + TypeScript + Vite 8
- Tailwind CSS 4
- PWA (vite-plugin-pwa)
- IndexedDB (Dexie.js)
- ffmpeg.wasm (音频提取)

## AI 服务

- DeepSeek — 翻译 + 拼音
- 腾讯云 ASR — 语音识别
- Azure TTS — 粤语朗读

## 开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 输出到 dist/
```

## 部署

详见 [DEPLOY.md](DEPLOY.md)。

### 快速部署（Vercel CLI）

```bash
cd ~/粤语学习软件
npx vercel --prod
```

首次使用需登录（GitHub / GitLab / 邮箱均可）。

## 文档

- `docs/requirements.md` — 产品需求
- `docs/tech-spec.md` — 技术选型
- `docs/design-spec.md` — UI 设计
- `docs/api-docs.md` — API 集成
- `docs/data-model.md` — 数据模型
- `docs/execution-plan.md` — 执行步骤

## 许可

MIT
