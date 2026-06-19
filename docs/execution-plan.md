# 执行步骤总表 (Execution Plan)

## 总览

| 步骤 | 名称 | 状态 | 依赖 |
|------|------|------|------|
| 0 | 项目初始化 + 文档体系 | ✅ 完成 | — |
| 1 | API 设置页面 + 加密存储 | ✅ 完成 | 0 |
| 2 | 视频导入模块 | ✅ 完成 | 0 |
| 3 | ffmpeg.wasm 音频提取 | ✅ 完成 | 2 |
| 4 | 腾讯云 ASR 集成 | ✅ 完成 | 3 |
| 5 | DeepSeek 翻译 + 拼音 | ✅ 完成 | 4 |
| 6 | 学习界面 + 字幕同步 | ✅ 完成 | 4, 5 |
| 7 | Azure TTS 音频播放器 | ✅ 完成 | 5 |
| 8 | 学习记录 + 打磨 | ✅ 完成 | 6, 7 |

## 每步详细任务

### 第 0 步：项目初始化 ✅
- [x] 删除空文件，创建项目目录
- [x] Vite + React + TypeScript 初始化
- [x] 安装依赖（tailwindcss, react-router-dom, zustand, dexie, vite-plugin-pwa）
- [x] 配置 Tailwind CSS + PWA
- [x] 搭建路由骨架 + 占位页面
- [x] 全局类型定义
- [x] 创建 docs/ + 6 份文档
- [x] 创建 devlog/ + CLAUDE.md
- [x] npm run dev 验证

### 第 1 步：API 设置 ✅
- [x] IndexedDB 初始化（Dexie）
- [x] Web Crypto 加密工具
- [x] API Key CRUD hook
- [x] DeepSeek 连接测试
- [x] 腾讯云 ASR 连接测试（V3 签名）
- [x] Azure TTS 连接测试
- [x] 设置页面 UI + 逻辑
- [x] 写开发日志 devlog/2026-06-20.md

### 第 2 步：视频导入 ✅
- [x] VideoImport 组件
- [x] VideoPlayer 组件（本地 + 在线）
- [x] 链接识别逻辑（link-parser.ts）
- [x] 移动端适配样式
- [x] 写开发日志 devlog/2026-06-21.md

### 第 3 步：ffmpeg.wasm ✅
- [x] 安装 @ffmpeg/ffmpeg
- [x] ffmpeg 加载 + 初始化
- [x] 视频 → WAV 音频提取
- [x] 进度展示
- [x] 错误处理
- [x] 写开发日志 devlog/2026-06-22.md

### 第 4 步：腾讯云 ASR ✅
- [x] 腾讯云 V3 签名实现
- [x] 创建识别任务
- [x] 轮询获取结果
- [x] 解析为 SubtitleSegment[]
- [x] 处理流水线 UI
- [x] 写开发日志 devlog/2026-06-23.md

### 第 5 步：DeepSeek 翻译 ✅
- [x] 翻译 API 调用
- [x] Prompt 调优
- [x] JSON 解析容错
- [x] 错误重试
- [x] 写开发日志 devlog/2026-06-24.md

### 第 6 步：学习界面 ✅
- [x] 视频 + 字幕同步 hook
- [x] SubtitlePanel 组件
- [x] 三行显示布局
- [x] 自动滚动 + 高亮
- [x] 手动/自动交互
- [x] 写开发日志 devlog/2026-06-24.md

### 第 7 步：Azure TTS 播放器 ✅
- [x] TTS API 调用
- [x] AudioPlayer 组件
- [x] 整段 / 逐句模式
- [x] 播放速度调节
- [x] 音频缓存
- [x] 写开发日志 devlog/2026-06-25.md

### 第 8 步：学习记录 + 打磨 ✅
- [x] HistoryList 组件
- [x] 学习进度保存/恢复
- [x] 删除记录
- [x] PWA 安装引导
- [x] Service Worker 缓存策略
- [x] 全局错误边界
- [x] 写开发日志 devlog/2026-06-26.md

## 执行规则

1. **一次只做一步**：完成 → 验证 → 写日志 → 再进入下一步
2. **每步写开发日志**：记录完成事项、待办、问题、下一步
3. **先看 CLAUDE.md**：每次新会话以此为入口，了解项目现状
