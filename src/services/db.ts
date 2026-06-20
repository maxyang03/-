import Dexie, { type Table } from 'dexie'
import type { VideoMeta, TranslatedSegment, StudyRecord } from '../types'

/** API Key 加密存储 */
export interface EncryptedKey {
  /** provider 作为主键: 'deepseek' | 'tencent' | 'azure' */
  provider: string
  /** AES-GCM 加密后的 Base64 密文 */
  encryptedData: string
  /** AES-GCM IV（Base64） */
  iv: string
}

/** TTS 音频缓存 */
export interface TtsCache {
  /** SHA-256 hash of the yue text */
  id: string
  /** 粤语原文 */
  yueText: string
  /** MP3 音频 blob */
  audioBlob: Blob
  /** 创建时间戳 */
  createdAt: number
}

/** 数据库 Schema */
class CantoneseDB extends Dexie {
  videos!: Table<VideoMeta, string>
  segments!: Table<TranslatedSegment, number>
  apiKeys!: Table<EncryptedKey, string>
  ttsCache!: Table<TtsCache, string>
  progress!: Table<StudyRecord, string>

  constructor() {
    super('CantoneseLearnerDB')

    this.version(1).stores({
      videos: 'id, importedAt, status',
      segments: '++id, videoId, [videoId+id]',
      apiKeys: 'provider',
      ttsCache: 'id, createdAt',
      progress: 'videoId',
    })
  }
}

/** 数据库单例 */
export const db = new CantoneseDB()
