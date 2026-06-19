# CLAUDE.md — 粤语学习助手

## 项目简介

这是一个 **PWA 粤语学习工具**（仅 iPhone），核心流程：
普通话视频 → 提取音频 → 腾讯云 ASR 语音识别 → DeepSeek 翻译粤语 + 粵拼标注 → Azure TTS 粤语朗读 → 对照学习

**用户**：不懂代码的小白，需要 AI 引导完成开发
**原则**：分步稳定推进，每步做完验证后再进下一步，每次会话结束写开发日志

---

## 关键路径

| 资源 | 路径 |
|------|------|
| **项目根目录** | `/Users/max/粤语学习软件/` |
| **产品需求** | `docs/requirements.md` |
| **技术选型** | `docs/tech-spec.md` |
| **UI 设计规范** | `docs/design-spec.md` |
| **API 集成文档** | `docs/api-docs.md` |
| **数据模型** | `docs/data-model.md` |
| **执行步骤总表** | `docs/execution-plan.md` |
| **开发日志** | `devlog/YYYY-MM-DD.md` |
| **类型定义** | `src/types/index.ts` |

---

## 工作规范

### 每次会话开始
1. 阅读 `docs/execution-plan.md` 确认当前执行到哪一步
2. 阅读最新的 `devlog/YYYY-MM-DD.md` 了解上次进度
3. 阅读需要修改的源文件

### 每次会话结束
1. 更新或创建 `devlog/YYYY-MM-DD.md`，记录：今日完成、待办、遇到的问题、下一步
2. 更新 `docs/execution-plan.md` 中对应步骤的状态

### 代码风格
- 使用已定义的类型（`src/types/index.ts`），不要重复定义
- 组件函数：`export default function ComponentName() {}`
- Hook 命名：`useXxxYyy`
- 文件命名：组件 PascalCase，hook/service camelCase
- Tailwind 原子类优先，避免自定义 CSS（除非全局样式）

### 移动端优先
- 所有交互元素 ≥ 44px 点击区域（添加 `touch-target` 类）
- 适配 safe-area（`safe-area-top` / `safe-area-bottom` 类）
- 禁止 user-scalable
- 测试时用 `npm run dev -- --host` 暴露局域网地址，iPhone 连同一 Wi-Fi 访问

### 验收标准
每步做完后：
1. `npm run dev` 启动无报错
2. 功能与对应步骤的验收标准一致
3. 写开发日志

---

## 技术栈（快速参考）

| 用途 | 选型 | 版本 |
|------|------|------|
| 框架 | React | ^19 |
| 构建 | Vite | ^8 |
| 样式 | Tailwind CSS | ^4.3 |
| 路由 | react-router-dom | ^7.18 |
| 状态 | zustand | ^5 |
| 存储 | Dexie.js (IndexedDB) | ^4.4 |
| PWA | vite-plugin-pwa | ^1.3 |
| 音频 | @ffmpeg/ffmpeg (第 3 步安装) | ^0.12 |

## AI 服务

| 服务 | 用途 | 认证 |
|------|------|------|
| DeepSeek | 翻译 + 拼音 | API Key (Bearer) |
| 腾讯云 ASR | 语音识别 | SecretId + SecretKey (V3 签名) |
| Azure TTS | 粤语朗读 | Subscription Key + Region |

---

## 当前状态

- **当前步骤**：全部完成 ✅ — 部署文件就绪，待 git push（Xcode 许可阻塞）
- **下一步**：用户在终端执行 git push → Vercel 导入部署
- **最近日志**：`devlog/2026-06-27.md`
