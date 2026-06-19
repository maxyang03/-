# 粤语学习助手 — 部署指引

## ⚠️ 前提：解除 Xcode 阻塞

git 命令被 Xcode 许可协议阻塞。先打开 **Mac 终端**，执行：

```
sudo xcodebuild -license accept
```

输入 Mac 密码，完成后再继续。

---

## 方式 A：先推 GitHub 再部署 Vercel（推荐）

### 第 1 步：推送到 GitHub

打开 Mac 终端，复制粘贴以下命令（一条一条执行）：

```bash
# 进入项目目录
cd ~/粤语学习软件

# 初始化 git 仓库
git init

# 添加所有文件（node_modules 和 dist 已排除）
git add .

# 首次提交
git commit -m "粤语学习助手 PWA"

# 连接 GitHub 仓库（仓库已由你创建）
git remote add origin https://github.com/maxyang03/-.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

> 如果 git push 要求用户名/密码：GitHub 已停用密码登录，需要到 https://github.com/settings/tokens 生成 Personal Access Token（勾选 repo 权限），用 Token 代替密码。

### 第 2 步：在 Vercel 导入

1. 打开 https://vercel.com
2. 用 GitHub 账号登录
3. 点击 **New Project**
4. 选择你的仓库
5. 不需要改任何设置，直接点 **Deploy**
6. 等待部署完成（约 30 秒）
7. 你会得到一个 `xxx.vercel.app` 的地址

---

## 方式 B：直接用 Vercel CLI 部署（更快）

不需要 GitHub，直接部署：

```bash
cd ~/粤语学习软件
npx vercel
```

按提示操作：
- 首次使用会要求登录（用 GitHub/GitLab/邮箱 均可）
- 所有选项用默认（回车）
- 最后一步 `npx vercel --prod` 发布到生产环境

---

## 部署后

1. 用 iPhone Safari 打开部署地址
2. 点击底部分享按钮 → **添加到主屏幕**
3. 桌面出现「粤语学习」App 图标
4. 打开 App → 先进入 **设置** 配置三组 API Key
5. 回到首页导入视频开始使用

---

## 需要的 API Key（三组）

| 服务 | 获取地址 |
|------|---------|
| DeepSeek | https://platform.deepseek.com/api_keys |
| 腾讯云 ASR | https://console.cloud.tencent.com/cam/capi |
| Azure TTS | https://portal.azure.com → 语音服务 |

## 项目地址

- **本地路径**：`/Users/max/粤语学习软件`
- **CLAUDE.md**：包含完整开发者指引
- **文档**：`docs/` 目录下 6 份标准文档
- **日志**：`devlog/` 目录下 8 篇开发日志
