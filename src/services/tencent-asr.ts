import { db } from './db'
import type { SubtitleSegment } from '../types'

// ===================================================
// 腾讯云 API V3 签名工具
// ===================================================

const encoder = new TextEncoder()

async function sha256Hex(message: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(message))
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

async function hmacSha256Hex(key: ArrayBuffer, message: string): Promise<string> {
  const sig = await hmacSha256(key, message)
  return Array.from(new Uint8Array(sig as ArrayBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 生成腾讯云 API V3 签名头
 */
async function signHeaders(
  secretId: string,
  secretKey: string,
  service: string,
  host: string,
  action: string,
  version: string,
  bodyJson: string,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  // Canonical Request
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const hashedPayload = await sha256Hex(bodyJson)
  const canonicalRequest = [
    'POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload,
  ].join('\n')

  // String to Sign
  const algorithm = 'TC3-HMAC-SHA256'
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest)
  const stringToSign = [
    algorithm, String(timestamp), credentialScope, hashedCanonicalRequest,
  ].join('\n')

  // Signature
  const kDate = await hmacSha256(encoder.encode(`TC3${secretKey}`).buffer as ArrayBuffer, date)
  const kService = await hmacSha256(kDate, service)
  const kSigning = await hmacSha256(kService, 'tc3_request')
  const signature = await hmacSha256Hex(kSigning, stringToSign)

  const authorization = [
    `${algorithm} Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  return {
    'Content-Type': 'application/json',
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Timestamp': String(timestamp),
    'Authorization': authorization,
  }
}

// ===================================================
// ASR 接口封装
// ===================================================

const ASR_HOST = 'asr.tencentcloudapi.com'
const ASR_VERSION = '2019-06-14'
const POLL_INTERVAL_MS = 2000
const POLL_MAX_TRIES = 60 // 2 分钟

/**
 * 将音频 WAV Blob 转为 base64（去掉 data URI 前缀）
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * 创建录音文件识别任务
 *
 * @returns TaskId（用于轮询）
 */
async function createRecTask(
  secretId: string,
  secretKey: string,
  audioBlob: Blob,
): Promise<number> {
  const base64 = await blobToBase64(audioBlob)

  const body = JSON.stringify({
    EngineModelType: '16k_zh',      // 中文普通话 16k
    ChannelNum: 1,
    ResTextFormat: 3,                // 返回含时间戳的详细结果
    SourceType: 1,                   // 音频数据以 base64 传入
    Data: base64,
    DataLen: audioBlob.size,
  })

  const headers = await signHeaders(
    secretId, secretKey, 'asr', ASR_HOST,
    'CreateRecTask', ASR_VERSION, body,
  )

  const res = await fetch(`https://${ASR_HOST}`, {
    method: 'POST',
    headers,
    body,
  })

  const data = await res.json()

  if (data.Response?.Error) {
    throw new Error(`腾讯云 ASR 错误: ${data.Response.Error.Code} — ${data.Response.Error.Message}`)
  }

  if (!data.Response?.Data?.TaskId) {
    throw new Error('创建识别任务失败：未返回 TaskId')
  }

  return data.Response.Data.TaskId
}

/**
 * 查询任务状态
 *
 * @returns 原始 Response JSON
 */
async function describeTaskStatus(
  secretId: string,
  secretKey: string,
  taskId: number,
): Promise<any> {
  const body = JSON.stringify({ TaskId: taskId })

  const headers = await signHeaders(
    secretId, secretKey, 'asr', ASR_HOST,
    'DescribeTaskStatus', ASR_VERSION, body,
  )

  const res = await fetch(`https://${ASR_HOST}`, {
    method: 'POST',
    headers,
    body,
  })

  return res.json()
}

/**
 * 轮询直到任务完成或失败
 */
async function pollTask(
  secretId: string,
  secretKey: string,
  taskId: number,
  onProgress?: (tries: number) => void,
): Promise<any> {
  for (let i = 1; i <= POLL_MAX_TRIES; i++) {
    onProgress?.(i)

    const data = await describeTaskStatus(secretId, secretKey, taskId)

    if (data.Response?.Error) {
      throw new Error(`查询识别状态失败: ${data.Response.Error.Code}`)
    }

    const status = data.Response?.Data?.StatusStr

    if (status === 'success') {
      return data.Response.Data
    }

    if (status === 'failed') {
      throw new Error(data.Response?.Data?.ErrorMsg || '识别失败')
    }

    // 还在处理中 → 等两秒再查
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }

  throw new Error('识别超时：超过 2 分钟仍未完成')
}

/**
 * 解析腾讯云 ASR 返回结果为内部数据格式
 */
function parseResult(data: any): SubtitleSegment[] {
  const detail = data?.ResultDetail
  if (!Array.isArray(detail)) return []

  return detail.filter((item: any) => item.FinalSentence?.trim()).map((item: any) => ({
    start: (item.StartMs || 0) / 1000,
    end: (item.EndMs || 0) / 1000,
    text: item.FinalSentence.trim(),
  }))
}

// ===================================================
// 对外 API
// ===================================================

export interface ASRProgress {
  stage: 'uploading' | 'polling'
  tries?: number
  maxTries?: number
}

/**
 * 完整的语音识别流水线
 *
 * @param audioBlob  WAV 音频（16kHz mono）
 * @param secretId   腾讯云 SecretId
 * @param secretKey  腾讯云 SecretKey
 * @param videoId    关联的视频 ID（用于存储结果）
 * @param onProgress 进度回调
 * @returns 识别出的句子数组
 */
export async function transcribeAudio(
  audioBlob: Blob,
  secretId: string,
  secretKey: string,
  videoId: string,
  onProgress?: (p: ASRProgress) => void,
): Promise<SubtitleSegment[]> {
  // 1. 创建任务
  onProgress?.({ stage: 'uploading' })
  const taskId = await createRecTask(secretId, secretKey, audioBlob)

  // 2. 轮询结果
  const rawResult = await pollTask(secretId, secretKey, taskId, (tries) => {
    onProgress?.({ stage: 'polling', tries, maxTries: POLL_MAX_TRIES })
  })

  // 3. 解析
  const segments = parseResult(rawResult)

  // 4. 存入 IndexedDB
  await db.segments.bulkPut(
    segments.map((seg, idx) => ({
      ...seg,
      videoId,
      index: idx,
      yue: undefined as any,
      jyutping: undefined as any,
    }))
  )

  // 5. 更新视频状态
  await db.videos.update(videoId, {
    status: 'ready', // ASR 完成 + 翻译还要做；先标 ready 表示可查看
    segmentCount: segments.length,
  })

  return segments
}
