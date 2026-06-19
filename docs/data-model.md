# 数据模型定义 (Data Model)

## TypeScript 类型定义

见 `/src/types/index.ts`

## IndexedDB 表结构

数据库名：`CantoneseLearnerDB`
版本：1

### 表 1：videos（视频元信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string (PK) | UUID v4 |
| title | string | 视频标题 |
| sourceType | 'local' \| 'url' | 来源类型 |
| sourceUrl | string | blob URL 或在线链接 |
| fileName | string? | 原始文件名 |
| importedAt | number | 导入时间戳 |
| status | enum | pending / extracting / transcribing / translating / ready / error |
| errorMessage | string? | 错误信息 |
| segmentCount | number? | 句子总数 |

### 表 2：segments（字幕句子）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number (auto) | 自增主键 |
| videoId | string (FK) | 关联 videos.id |
| index | number | 句子序号（在视频中的顺序） |
| start | number | 开始时间（秒） |
| end | number | 结束时间（秒） |
| text | string | 普通话原文 |
| yue | string? | 粤语翻译 |
| jyutping | string? | 粤拼标注 |
| audioId | string? | TTS 音频缓存 key |

**索引**：`videoId` / `videoId + index`

### 表 3：apiKeys（加密存储的 API Key）

| 字段 | 类型 | 说明 |
|------|------|------|
| provider | string (PK) | 'deepseek' / 'tencent' / 'azure' |
| encryptedData | string | AES-GCM 加密后的 JSON |
| iv | string | 加密 IV（base64） |

### 表 4：ttsCache（TTS 音频缓存）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string (PK) | SHA-256 hash of yue text |
| yueText | string | 粤语原文 |
| audioBlob | Blob | MP3 音频 |
| createdAt | number | 创建时间戳 |

### 表 5：progress（学习进度）

| 字段 | 类型 | 说明 |
|------|------|------|
| videoId | string (PK) | 关联 videos.id |
| lastPosition | number | 上次播放位置（秒） |
| studyCount | number | 学习次数 |
| lastStudiedAt | number | 上次学习时间戳 |

## 数据关系

```
videos (1) ──→ (*) segments
     │
     └──→ (0..1) progress

segments (*) ──→ (0..1) ttsCache

apiKeys (独立)
```

## 加密方案

API Key 使用 Web Crypto API AES-GCM 加密：

```
encryptionKey = deriveKey(userDeviceFingerprint)
  ↓
encryptedData, iv = AES-GCM-encrypt(plaintext, encryptionKey)
  ↓
store { provider, encryptedData, iv } in IndexedDB
```

注意：userDeviceFingerprint 通过收集浏览器不变量生成（navigator.hardwareConcurrency、screen 参数等拼接），不持久化随机 key。这不是绝对安全（前端加密本质如此），但比明文存储安全。

## 存储配额

IndexedDB 浏览器存储配额因设备而异：
- iOS Safari：约 500MB（按需申请）
- Chrome：约 60% 磁盘可用空间

TTS 缓存策略：LRU，最多保留 200 条音频记录。
