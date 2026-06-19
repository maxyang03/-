// ==========================================
// 全局类型定义
// ==========================================

/** 字幕句子 — ASR 返回的原始数据 */
export interface SubtitleSegment {
  /** 开始时间（秒） */
  start: number
  /** 结束时间（秒） */
  end: number
  /** 普通话原文 */
  text: string
}

/** 翻译后的字幕句子 */
export interface TranslatedSegment extends SubtitleSegment {
  /** 粤语翻译 */
  yue: string
  /** 粤拼（Jyutping） */
  jyutping: string
  /** TTS 音频缓存 ID */
  audioId?: string
}

/** API Key 配置 */
export interface ApiKeys {
  deepseekKey: string
  tencentSecretId: string
  tencentSecretKey: string
  azureSubscriptionKey: string
  azureRegion: string
}

/** 视频来源类型 */
export type VideoSourceType = 'local' | 'url'

/** 视频元信息 */
export interface VideoMeta {
  /** 唯一 ID */
  id: string
  /** 视频标题 */
  title: string
  /** 来源类型 */
  sourceType: VideoSourceType
  /** 本地文件 Blob URL 或在线链接 */
  sourceUrl: string
  /** 原始文件名（本地文件时） */
  fileName?: string
  /** 导入时间 */
  importedAt: number
  /** 处理状态 */
  status: 'pending' | 'extracting' | 'transcribing' | 'translating' | 'ready' | 'error'
  /** 错误信息 */
  errorMessage?: string
  /** 句子总数 */
  segmentCount?: number
}

/** 学习记录 */
export interface StudyRecord {
  /** 关联的 VideoMeta ID */
  videoId: string
  /** 上次播放位置（秒） */
  lastPosition: number
  /** 学习次数 */
  studyCount: number
  /** 上次学习时间 */
  lastStudiedAt: number
}

/** 播放模式 */
export type PlayMode = 'full' | 'sentence'

/** 播放速度 */
export type PlaybackRate = 0.5 | 0.75 | 1 | 1.25 | 1.5

/** API 连接测试状态 */
export type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error'
