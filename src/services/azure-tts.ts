import { db } from './db'

// ===================================================
// Azure TTS REST API
// ===================================================

/**
 * 可用粤语语音
 *
 * zh-HK-HiuMaanNeural — 晓曼（女声，标准）
 * zh-HK-HiuGaaiNeural — 晓佳（女声，柔和）
 * zh-HK-WanLungNeural — 云龙（男声）
 */
export type CantoneseVoice = 'zh-HK-HiuMaanNeural' | 'zh-HK-HiuGaaiNeural' | 'zh-HK-WanLungNeural'

/**
 * 对单句粤语文本发起 TTS 请求
 *
 * @returns MP3 audio Blob
 */
export async function synthesizeSpeech(
  yueText: string,
  subscriptionKey: string,
  region: string,
  voice: CantoneseVoice = 'zh-HK-HiuMaanNeural',
): Promise<Blob> {
  const ssml = `
<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-HK'>
  <voice name='${voice}'>
    <prosody rate="0.9">
      ${yueText}
    </prosody>
  </voice>
</speak>`.trim()

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
  )

  if (!response.ok) {
    const err = await response.text().catch(() => '')
    throw new Error(`Azure TTS 错误 (${response.status}): ${err}`)
  }

  return response.blob()
}

/**
 * 简单哈希（用于 TTS 缓存 key）
 */
async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 带缓存的粤语 TTS
 *
 * 先查 IndexedDB ttsCache 表，命中直接返回；未命中则请求 Azure 并缓存。
 */
export async function synthesizeWithCache(
  yueText: string,
  subscriptionKey: string,
  region: string,
  voice?: CantoneseVoice,
): Promise<Blob> {
  const id = await hashText(yueText)

  // 查缓存
  const cached = await db.ttsCache.get(id)
  if (cached) {
    return cached.audioBlob
  }

  // 生成
  const blob = await synthesizeSpeech(yueText, subscriptionKey, region, voice)

  // 存缓存
  try {
    await db.ttsCache.put({ id, yueText, audioBlob: blob, createdAt: Date.now() })
  } catch {
    // 缓存满了或写失败，不阻塞
    console.warn('TTS 缓存写入失败')
  }

  return blob
}

/**
 * 为所有句子生成 TTS（逐句缓存，可按需暂停）
 *
 * 返回每句的 blob URL 数组，调用方负责 revoke。
 */
export async function synthesizeAll(
  sentences: Array<{ yue: string }>,
  subscriptionKey: string,
  region: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const results: string[] = []

  for (let i = 0; i < sentences.length; i++) {
    if (signal?.aborted) break

    try {
      const blob = await synthesizeWithCache(sentences[i].yue, subscriptionKey, region)
      results.push(URL.createObjectURL(blob))
    } catch (err) {
      console.error(`第 ${i + 1} 句 TTS 失败:`, err)
      results.push('') // 空位
    }

    onProgress?.(i + 1, sentences.length)

    // 批次间短暂休息（避免速率限制）
    if (i < sentences.length - 1) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return results
}

/**
 * 将多个 MP3 blob 拼接为一个（用于整段播放）
 *
 * 在句子间插入静音间隔（silenceDurationSec 秒）。
 * 使用 AudioContext 解码 → 拼接 Buffer → 重新编码。
 * 如果浏览器不支持，回退为 blob 拼接（可能无法播放间隙）。
 */
export async function concatBlobs(
  blobUrls: string[],
  silenceDurationSec = 0.3,
): Promise<Blob | null> {
  const valid = blobUrls.filter(Boolean)
  if (valid.length === 0) return null
  if (valid.length === 1) {
    const res = await fetch(valid[0])
    return res.blob()
  }

  try {
    const audioCtx = new AudioContext()
    const sampleRate = 16000

    // 逐个解码
    const buffers: AudioBuffer[] = []
    for (const url of valid) {
      const res = await fetch(url)
      const arrayBuf = await res.arrayBuffer()
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf)
      buffers.push(audioBuf)
    }

    // 计算总长度
    const totalLength = buffers.reduce(
      (sum, b) => sum + b.length, 0
    ) + Math.floor(silenceDurationSec * sampleRate) * (buffers.length - 1)

    // 创建输出 buffer
    const output = audioCtx.createBuffer(1, totalLength, sampleRate)
    const channel = output.getChannelData(0)

    let offset = 0
    for (let i = 0; i < buffers.length; i++) {
      // 复制句子音频
      const data = buffers[i].getChannelData(0)
      channel.set(data, offset)
      offset += data.length

      // 插入静音（最后一句后不加）
      if (i < buffers.length - 1) {
        offset += Math.floor(silenceDurationSec * sampleRate)
      }
    }

    await audioCtx.close()

    // 编码为 WAV（简单方案）
    return encodeWAV(output, sampleRate)
  } catch (err) {
    console.error('音频拼接失败，回退为简单拼接:', err)
    // 回退：直接合并 blob
    const parts = await Promise.all(valid.map(url => fetch(url).then(r => r.blob())))
    return new Blob(parts, { type: 'audio/mp3' })
  }
}

/** 将 AudioBuffer 编码为 WAV Blob */
function encodeWAV(audioBuffer: AudioBuffer, sampleRate: number): Blob {
  const numChannels = 1
  const bitsPerSample = 16
  const data = audioBuffer.getChannelData(0)
  const dataLength = data.length * (bitsPerSample / 8)
  const headerLength = 44
  const totalLength = headerLength + dataLength

  const buffer = new ArrayBuffer(totalLength)
  const view = new DataView(buffer)

  // WAV header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, totalLength - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true)
  view.setUint16(32, numChannels * (bitsPerSample / 8), true)
  view.setUint16(34, bitsPerSample, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  // PCM data
  let offset = 44
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
